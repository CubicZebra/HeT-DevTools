import { join } from 'node:path';
import { FcppMetadata, FcppProject, ToolStatus } from '../types';
import { pathExists } from '../utils/fs';

/**
 * Health-check rule engine (development-plan T-1.9 / G-03).
 * Pure logic with injectable tool/state facts; filesystem probes only via
 * project.root. Fully unit-testable without the VS Code host.
 */

export type CheckKind = 'ok' | 'warn' | 'fail';

export interface HealthCheckItem {
  id: string;
  title: string;
  kind: CheckKind;
  detail: string;
  suggestion?: string;
  /** Contribution to the 100-point score when ok (warn = half, fail = 0). */
  weight: number;
}

export interface HealthInput {
  project?: FcppProject;
  tools?: Record<string, ToolStatus>;
  state?: {
    lastBuildOk?: boolean;
    lastTestsOk?: boolean;
  };
}

export interface HealthReport {
  score: number;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  checks: HealthCheckItem[];
}

interface RuleResult {
  ok: boolean;
  required?: boolean;
  detail: string;
  suggestion?: string;
}

type RuleFn = (ctx: {
  meta?: FcppMetadata;
  root?: string;
  tools?: Record<string, ToolStatus>;
  state?: HealthInput['state'];
}) => Promise<RuleResult>;

const VERDICT_PASS = 80;
const VERDICT_WARN = 50;

export async function runHealthCheck(input: HealthInput): Promise<HealthReport> {
  const meta = input.project?.metadata;
  const root = input.project?.root;

  const rules: Array<{ id: string; title: string; weight: number; run: RuleFn }> = [
    {
      id: 'env.conan',
      title: 'Conan 可用',
      weight: 10,
      run: () =>
        Promise.resolve(
          toolResult('conan', input.tools, '构建依赖 Conan 2；缺失将无法构建。', '安装 conan（pip install conan）并 conan profile detect --force'),
        ),
    },
    {
      id: 'env.git',
      title: 'Git 可用',
      weight: 5,
      run: () =>
        Promise.resolve(
          toolResult('git', input.tools, '规范提交与 CI 需要 git。', '安装 git'),
        ),
    },
    {
      id: 'meta.parsed',
      title: 'metadata.json 可解析',
      weight: 15,
      run: async () => {
        if (input.project?.metadataError) {
          return { ok: false, required: true, detail: input.project.metadataError, suggestion: '修复 metadata.json 的 JSON 语法' };
        }
        if (!meta) {
          return { ok: false, required: true, detail: '未读取到 metadata.json', suggestion: '创建 fcpp 项目应包含 metadata.json' };
        }
        return { ok: true, detail: `name=${meta.name}, version=${meta.version ?? '?'}` };
      },
    },
    {
      id: 'meta.core',
      title: '核心字段完整',
      weight: 10,
      run: async () => {
        const missing: string[] = [];
        if (!meta) return { ok: false, required: true, detail: '缺少元数据', suggestion: '先修复解析' };
        if (!meta.name) missing.push('name');
        if (!meta.version) missing.push('version');
        if (!meta.build_type) missing.push('build_type');
        return missing.length === 0
          ? { ok: true, detail: `name/version/build_type = ${meta.name}/${meta.version}/${meta.build_type}` }
          : { ok: false, required: true, detail: `缺少字段: ${missing.join(', ')}`, suggestion: '在“项目设置”中补全' };
      },
    },
    {
      id: 'deps.buckets',
      title: '依赖四桶结构',
      weight: 10,
      run: async () => {
        const deps = meta?.dependencies;
        const buckets = deps ? ['common', 'c', 'cpp', 'infra'].filter((b) => !(b in deps)) : null;
        if (deps && buckets!.length === 0) {
          return { ok: true, detail: 'common / c / cpp / infra 均存在' };
        }
        if (deps && buckets!.length > 0) {
          return { ok: true, detail: `缺少可选桶: ${buckets!.join(', ')}（可接受）` };
        }
        return { ok: false, required: true, detail: '缺少 dependencies 字段', suggestion: '在“项目设置 → 依赖”中添加' };
      },
    },
    {
      id: 'switches.ci',
      title: 'CI 开关配置',
      weight: 10,
      run: async () => {
        const t = meta?.workflow_triggers;
        if (!t) {
          return { ok: false, required: true, detail: '缺少 workflow_triggers', suggestion: '在“项目设置 → CI 开关”中配置' };
        }
        const anyOn = Object.values(t).some(Boolean);
        return anyOn
          ? { ok: true, detail: `已开启 ${Object.entries(t).filter(([, v]) => v).map(([k]) => k).join(', ')}` }
          : { ok: false, required: true, detail: '全部开关为 false（提交 emoji 不会触发任何 CI）', suggestion: '至少开启 build/tests' };
      },
    },
    {
      id: 'tests.present',
      title: '测试可用',
      weight: 10,
      run: async () => {
        const dir = root ? await pathExists(join(root, 'test_package')) : false;
        const enabled = meta?.trigger_tests === true;
        if (enabled || dir) {
          return { ok: true, detail: `${enabled ? 'trigger_tests 开启' : ''}${enabled && dir ? ' · ' : ''}${dir ? 'test_package 存在' : ''}` };
        }
        return { ok: false, required: false, detail: 'test_package 缺失且 trigger_tests 关闭', suggestion: '生成测试或开启 trigger_tests' };
      },
    },
    {
      id: 'coverage.enabled',
      title: '覆盖率开关',
      weight: 5,
      run: async () => {
        if (meta?.activate_code_coverage) return { ok: true, detail: 'activate_code_coverage = true' };
        return { ok: false, required: false, detail: '覆盖率未开启（Debug 构建可生成报告）', suggestion: '在“项目设置 → 测试与覆盖”开启' };
      },
    },
    {
      id: 'docs.enabled',
      title: '文档配置',
      weight: 5,
      run: async () => {
        const langs = meta?.doc_languages;
        if (langs && langs.length > 0) return { ok: true, detail: `doc_languages = ${langs.join(', ')}` };
        return { ok: false, required: false, detail: '未配置 doc_languages', suggestion: '在“项目设置 → 文档”中配置' };
      },
    },
    {
      id: 'quality.config',
      title: '质量门禁配置',
      weight: 5,
      run: async () => {
        const hasConfig = root ? await pathExists(join(root, '.github', 'misc', '.clang-format-cpp')) : false;
        if (hasConfig) return { ok: true, detail: '.github/misc 配置齐全' };
        return { ok: false, required: false, detail: '缺少 .clang-format-cpp 等门禁配置', suggestion: '从 fcpp 模板同步 .github/misc' };
      },
    },
    {
      id: 'state.build',
      title: '最近构建',
      weight: 10,
      run: async () => {
        const s = input.state?.lastBuildOk;
        if (s === true) return { ok: true, detail: '最近一次构建成功' };
        if (s === false) return { ok: false, required: true, detail: '最近一次构建失败', suggestion: '打开“构建”查看错误并修复' };
        return { ok: false, required: false, detail: '尚未构建过', suggestion: '点击“构建项目”' };
      },
    },
    {
      id: 'state.tests',
      title: '最近测试',
      weight: 5,
      run: async () => {
        const s = input.state?.lastTestsOk;
        if (s === true) return { ok: true, detail: '最近一次测试全绿' };
        if (s === false) return { ok: false, required: false, detail: '最近一次测试存在失败', suggestion: '在测试浏览器中查看' };
        return { ok: false, required: false, detail: '尚未运行测试', suggestion: '构建并测试' };
      },
    },
  ];

  const checks: HealthCheckItem[] = [];
  for (const rule of rules) {
    const result = await rule.run({ meta, root, tools: input.tools, state: input.state });
    const kind: CheckKind = result.ok ? 'ok' : result.required ? 'fail' : 'warn';
    checks.push({
      id: rule.id,
      title: rule.title,
      kind,
      detail: result.detail,
      suggestion: result.suggestion,
      weight: rule.weight,
    });
  }

  let raw = 0;
  for (const c of checks) {
    raw += c.kind === 'ok' ? c.weight : c.kind === 'warn' ? c.weight * 0.5 : 0;
  }
  const score = Math.round(raw);
  const verdict = score >= VERDICT_PASS ? 'PASS' : score >= VERDICT_WARN ? 'WARN' : 'FAIL';

  return { score, verdict, checks };
}

function toolResult(
  name: string,
  tools: Record<string, ToolStatus> | undefined,
  detailMissing: string,
  suggestion: string,
): RuleResult {
  const tool = tools?.[name];
  if (tool?.state === 'ok') {
    return { ok: true, detail: `${tool.version ?? name} @ ${tool.foundPath}` };
  }
  if (tool?.state === 'versionMismatch') {
    return { ok: false, required: true, detail: `${name} 版本 ${tool.version ?? '?'} 低于要求 ${tool.required ?? '?'}`, suggestion };
  }
  return { ok: false, required: true, detail: detailMissing, suggestion };
}
