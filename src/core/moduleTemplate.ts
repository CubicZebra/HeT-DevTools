import { pathExists } from '../utils/fs';
import { join } from 'node:path';

/**
 * New-module wizard core (development-plan T-2.4 / G-08).
 * Generates the fcpp-paired file skeleton (include/ + src/) with:
 *  - `// Conan::ImportStart / ImportEnd` wrappers
 *  - bilingual `@brief [en]/[zh]`, `@since`, `@exporter` doc comments
 *  - two blank lines between global objects
 *  - `.h/.c` for C, `.hpp/.cpp` for C++
 * Pure logic — no VS Code imports.
 */

export type ModuleLanguage = 'cpp' | 'c';

export interface ModulePlanInput {
  /** Lowercase snake/identifier, e.g. "mymod". */
  moduleName: string;
  description: string;
  language: ModuleLanguage;
  since: string;
  /** Optional raw declarations appended to the header (no #include lines). */
  extraDeclarations?: string[];
}

export interface PlannedFile {
  relPath: string;
  content: string;
}

export interface ModulePlan {
  ok: boolean;
  issues: string[];
  files: PlannedFile[];
}

const NAME_RE = /^[a-z][a-z0-9_]*$/;

function declDoc(lines: string[]): string {
  return lines
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'))
    .join('\n\n\n'); // three blank lines = separate global objects per convention
}

export function planModuleFiles(input: ModulePlanInput): ModulePlan {
  const issues: string[] = [];
  const raw = input.moduleName.trim();
  const name = raw.toLowerCase();
  const desc = input.description.trim();
  const since = input.since.trim() || '1.0';

  if (!NAME_RE.test(raw)) {
    issues.push('模块名须为小写标识符（字母开头，仅 a-z/0-9/_，如 mymod）');
  }
  if (desc.length === 0) {
    issues.push('请填写一句话说明（将写入双语注释）');
  }
  if (issues.length > 0) {
    return { ok: false, issues, files: [] };
  }

  const isCpp = input.language === 'cpp';
  const [headerSuffix, sourceSuffix] = isCpp ? ['hpp', 'cpp'] : ['h', 'c'];
  const includeGuard = isCpp ? '#pragma once\n#include <cstdint>' : '#pragma once';

  const headerDoc = `/**
 * @brief [en] ${desc}
 * @brief [zh] ${desc}
 * @since ${since}
 * @exporter
 */`;

  const decls = input.extraDeclarations?.filter((d) => d.trim().length > 0) ?? [];
  const initDecl = isCpp ? `void ${name}_init(void);` : `void ${name}_init(void);`;

  const headerBody = [
    `// Conan::ImportStart`,
    includeGuard,
    `// Conan::ImportEnd`,
    ``,
    headerDoc,
    initDecl,
  ].join('\n');

  const extra = declDoc(decls);
  const headerContent = extra ? `${headerBody}\n\n\n${headerDoc}\n${extra}` : headerBody;

  const srcDoc = `/**
 * @brief [en] ${desc} — implementation
 * @brief [zh] ${desc} — 实现
 * @since ${since}
 */`;
  const sourceContent = [
    `// Conan::ImportStart`,
    `#include <${name}.${headerSuffix}>`,
    `// Conan::ImportEnd`,
    ``,
    srcDoc,
    `void ${name}_init(void) {`,
    `    // TODO: implement`,
    `}`,
  ].join('\n');

  return {
    ok: true,
    issues: [],
    files: [
      { relPath: `include/${name}.${headerSuffix}`, content: `${headerContent}\n` },
      { relPath: `src/${name}.${sourceSuffix}`, content: `${sourceContent}\n` },
    ],
  };
}

/** Detect an existing pair so the wizard can warn before writing. */
export async function hasPair(root: string, moduleName: string): Promise<boolean> {
  for (const suffix of ['hpp', 'cpp', 'h', 'c']) {
    if (await pathExists(join(root, 'include', `${moduleName}.${suffix}`))) {
      return true;
    }
    if (await pathExists(join(root, 'src', `${moduleName}.${suffix}`))) {
      return true;
    }
  }
  return false;
}
