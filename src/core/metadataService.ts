import { join } from 'node:path';
import { FcppMetadata } from '../types';
import { pathExists, readJson, writeJson } from '../utils/fs';

/**
 * metadata.json service (development-plan T-2.1).
 * Pure logic on top of fs utils — no VS Code, no runtime npm deps.
 *
 * The contract mirrors fcpp `.github/skills/_shared/metadata-contract.md`:
 *  - one dependency package in exactly one bucket (common = C/C++ shared)
 *  - GTest only allowed in `infra`
 *  - pybind11 only when enable_python_bindings = true
 *  - key names are normalized case-insensitively (Eigen3 vs eigen)
 */

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  field?: string;
  severity: IssueSeverity;
  message: string;
}

export interface MetadataDiffEntry {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface MetadataPatchResult {
  ok: boolean;
  issues: ValidationIssue[];
  diff: MetadataDiffEntry[];
  /** Written only when ok=true and persist=true. */
  backupFile?: string;
}

const CPP_STDS = new Set(['17', '20', '23']);
const C_STDS = new Set(['11', '17']);
const BUILD_TYPES = new Set(['Debug', 'Release']);
const DEP_BUCKETS = ['common', 'c', 'cpp', 'infra'] as const;
const BOOLEAN_FIELDS = [
  'is_shared',
  'is_header',
  'generate_modules_inplace',
  'trigger_tests',
  'activate_code_coverage',
  'saving_tests_log',
  'enable_python_bindings',
] as const;

function fieldIssue(field: string, severity: IssueSeverity, message: string): ValidationIssue {
  return { field, severity, message };
}

/** Structural validation of the fcpp metadata contract (all fields). */
export function validateMetadata(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [fieldIssue('$', 'error', 'metadata.json 顶层必须是 JSON 对象')];
  }
  const m = raw as Record<string, unknown>;

  const needString = (key: string): void => {
    const v = m[key];
    if (v !== undefined && typeof v !== 'string') {
      issues.push(fieldIssue(key, 'error', `字段 ${key} 应为字符串`));
    }
  };
  const needStringArray = (key: string): void => {
    const v = m[key];
    if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))) {
      issues.push(fieldIssue(key, 'error', `字段 ${key} 应为字符串数组`));
    }
  };

  // basics
  if (typeof m.name !== 'string' || m.name.trim().length === 0) {
    issues.push(fieldIssue('name', 'error', 'name 必须是非空字符串（库/包名）'));
  }
  if (typeof m.version !== 'string' || m.version.trim().length === 0) {
    issues.push(fieldIssue('version', 'error', 'version 必须是非空字符串（如 0.1.0）'));
  }
  needString('description');
  needString('license');
  needStringArray('authors');
  needStringArray('maintainers');
  needStringArray('topics');

  // build parameters
  if (m.build_cppstd !== undefined && !CPP_STDS.has(String(m.build_cppstd))) {
    issues.push(fieldIssue('build_cppstd', 'error', `build_cppstd 应为 ${[...CPP_STDS].join('/')}（当前 ${String(m.build_cppstd)}）`));
  }
  if (m.build_cstd !== undefined && !C_STDS.has(String(m.build_cstd))) {
    issues.push(fieldIssue('build_cstd', 'warning', `build_cstd 建议为 ${[...C_STDS].join('/')}`));
  }
  if (m.build_type !== undefined && !BUILD_TYPES.has(String(m.build_type))) {
    issues.push(fieldIssue('build_type', 'error', `build_type 应为 Debug 或 Release（当前 ${String(m.build_type)}）`));
  }
  for (const key of BOOLEAN_FIELDS) {
    const v = m[key];
    if (v !== undefined && typeof v !== 'boolean') {
      issues.push(fieldIssue(key, 'error', `字段 ${key} 应为布尔值`));
    }
  }

  // dependencies: four buckets with string-array targets
  const deps = m.dependencies;
  if (deps !== undefined) {
    if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) {
      issues.push(fieldIssue('dependencies', 'error', 'dependencies 应为对象'));
    } else {
      const seen = new Map<string, string>();
      const d = deps as Record<string, unknown>;
      for (const bucket of DEP_BUCKETS) {
        const group = d[bucket];
        if (group === undefined) {
          continue; // optional bucket
        }
        if (group === null || typeof group !== 'object' || Array.isArray(group)) {
          issues.push(fieldIssue(`dependencies.${bucket}`, 'error', `dependencies.${bucket} 应为对象`));
          continue;
        }
        for (const [pkg, targets] of Object.entries(group as Record<string, unknown>)) {
          if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
            issues.push(fieldIssue(`dependencies.${bucket}.${pkg}`, 'error', `依赖 ${pkg} 的 targets 应为字符串数组`));
          }
          const norm = pkg.toLowerCase();
          if (seen.has(norm)) {
            issues.push(
              fieldIssue(`dependencies.${bucket}.${pkg}`, 'error', `包 ${pkg} 同时出现在 ${seen.get(norm)} 与 ${bucket}（一个包只能归一个桶）`),
            );
          } else {
            seen.set(norm, bucket);
          }
        }
      }
      // GTest only in infra; pybind11 in main-package buckets gated by the switch
      const gtestBucket = seen.get('gtest');
      if (gtestBucket && gtestBucket !== 'infra') {
        issues.push(fieldIssue(`dependencies.${gtestBucket}.GTest`, 'error', 'GTest 只能放在 infra 桶（主机测试设施，不进主包组件）'));
      }
      const pyBucket = seen.get('pybind11');
      if (pyBucket && pyBucket !== 'infra' && m.enable_python_bindings !== true) {
        issues.push(fieldIssue(`dependencies.${pyBucket}.pybind11`, 'error', 'pybind11 进入主包依赖（common/c/cpp）需要 enable_python_bindings = true'));
      }
    }
  }

  // workflow triggers
  const triggers = m.workflow_triggers;
  if (triggers !== undefined) {
    if (triggers === null || typeof triggers !== 'object' || Array.isArray(triggers)) {
      issues.push(fieldIssue('workflow_triggers', 'error', 'workflow_triggers 应为对象'));
    } else {
      const t = triggers as Record<string, unknown>;
      for (const key of ['build', 'tests', 'release', 'docs', 'security_scan']) {
        const v = t[key];
        if (v !== undefined && typeof v !== 'boolean') {
          issues.push(fieldIssue(`workflow_triggers.${key}`, 'error', `workflow_triggers.${key} 应为布尔值`));
        }
      }
      const values = Object.values(t);
      if (values.length > 0 && values.every((v) => v === false)) {
        issues.push(fieldIssue('workflow_triggers', 'warning', '所有 CI 开关均为 false：提交标签不会触发任何流水线'));
      }
    }
  }

  // docs
  needStringArray('doc_languages');
  needStringArray('doc_versions');
  needStringArray('doc_doxygen_folders');
  needStringArray('doc_doxygen_suffix');
  needStringArray('baremetal_white_list');

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** Compute a shallow field diff between two metadata objects. */
export function diffMetadata(oldObj: FcppMetadata, newObj: FcppMetadata): MetadataDiffEntry[] {
  const diff: MetadataDiffEntry[] = [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  for (const key of keys) {
    const oldValue = (oldObj as Record<string, unknown>)[key];
    const newValue = (newObj as Record<string, unknown>)[key];
    if (oldValue === undefined && newValue !== undefined) {
      diff.push({ field: key, newValue });
    } else if (newValue === undefined) {
      diff.push({ field: key, oldValue });
    } else if (!same(oldValue, newValue)) {
      diff.push({ field: key, oldValue, newValue });
    }
  }
  return diff;
}

/** Load the parsed metadata of a project. */
export async function loadMetadata(root: string): Promise<FcppMetadata> {
  return readJson<FcppMetadata>(join(root, 'metadata.json'));
}

export interface ApplyMetadataOptions {
  /** Write the file (false = dry-run preview only). */
  persist?: boolean;
}

/**
 * Preview or apply a top-level patch against metadata.json.
 * - validates the patched document (errors block writes)
 * - computes a field diff (preview)
 * - persists with a `.bak` backup when persist=true
 */
export async function applyMetadataPatch(
  root: string,
  patch: Record<string, unknown>,
  options: ApplyMetadataOptions = {},
): Promise<MetadataPatchResult> {
  const file = join(root, 'metadata.json');
  if (!(await pathExists(file))) {
    return { ok: false, issues: [{ field: '$', severity: 'error', message: '未找到 metadata.json' }], diff: [] };
  }
  const current = (await readJson(file)) as FcppMetadata;
  const next = { ...current, ...patch } as FcppMetadata;

  const issues = validateMetadata(next);
  const diff = diffMetadata(current, next);
  if (hasErrors(issues)) {
    return { ok: false, issues, diff };
  }
  if (options.persist) {
    await writeJson(file, next, { backup: true });
  }
  return { ok: true, issues, diff };
}
