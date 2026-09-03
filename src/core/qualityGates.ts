/**
 * Quality gates core (development-plan T-3.2 / G-11).
 * Pure logic — no VS Code imports.
 *
 * Mirrors the fcpp native gates so "local green == CI green":
 *  - clang-format (dual configs: C right-aligned / C++ left-aligned)
 *  - clang-tidy (WarningsAsErrors)
 *  - metadata schema/contract check (re-uses metadataService rules)
 *  - commitlint (exact rules from .github/misc/commitlint.config.js)
 *  - secrets gate is tool-gated (gitleaks), reported as unavailable when absent
 */

export const QUALITY_TYPES = ['feat', 'fix', 'perf', 'docs', 'test', 'build', 'ci', 'refactor', 'style', 'chore'];

/** Extension → which clang-format config family applies (C vs C++). */
export function formatConfigForFile(relPath: string): 'c' | 'cpp' | null {
  const lower = relPath.toLowerCase();
  if (/\.(c|h)$/.test(lower)) {
    return 'c';
  }
  if (/\.(cc|cpp|cxx|hpp|hxx|hh)$/.test(lower)) {
    return 'cpp';
  }
  return null;
}

export const CLANG_FORMAT_CONFIG = (fam: 'c' | 'cpp'): string => `.github/misc/.clang-format-${fam === 'c' ? 'c' : 'cpp'}`;

export function clangFormatCheckArgs(file: string, family: 'c' | 'cpp'): string[] {
  return ['--dry-run', '--Werror', `--style=file:${CLANG_FORMAT_CONFIG(family)}`, file];
}

export function clangFormatFixArgs(file: string, family: 'c' | 'cpp'): string[] {
  return ['-i', `--style=file:${CLANG_FORMAT_CONFIG(family)}`, file];
}

export interface QualityIssue {
  file: string;
  line?: number;
  column?: number;
  message: string;
  check: string;
}

const FORMAT_VIOLATION_RE = /^(.+?):(\d+):(\d+): error: code should be clang-formatted/;

/** Parse `clang-format --dry-run --Werror` output into per-file issues. */
export function parseClangFormatOutput(output: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const m = FORMAT_VIOLATION_RE.exec(line.trim());
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      issues.push({
        file: m[1],
        line: Number(m[2]),
        column: Number(m[3]),
        message: '代码不符合 clang-format（本地门禁，警告即失败）',
        check: 'format',
      });
    }
  }
  return issues;
}

const TIDY_RE = /^(.+?):(\d+):(\d+):\s+(warning|error):\s+(.+?)\s+\[([^\]]+)\]/;

/** Parse clang-tidy diagnostics (WarningsAsErrors: warnings count as failures). */
export function parseClangTidyOutput(output: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = TIDY_RE.exec(line.trim());
    if (m) {
      issues.push({
        file: m[1],
        line: Number(m[2]),
        column: Number(m[3]),
        message: `${m[5]} [${m[6]}]`,
        check: 'tidy',
      });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * commitlint (rules copied verbatim from fcpp commitlint.config.js).
 * ------------------------------------------------------------------ */

export interface CommitHeader {
  type: string;
  scope: string;
  subject: string;
  breaking: boolean;
}

const HEADER_RE = /^(\w*)(?:\(([^)]*)\))?!?: (.*)$/;

/** Split a full commit header (first line) into parts, mirroring commitlint. */
export function parseCommitHeader(header: string): CommitHeader {
  const m = HEADER_RE.exec(header);
  if (!m) {
    return { type: '', scope: '', subject: '', breaking: false };
  }
  const typePart = m[1];
  const scope = m[2] ?? '';
  const subject = m[3];
  const breaking = /!$/.test(header.slice(0, header.indexOf(':'))) || subject.startsWith('BREAKING CHANGE');
  return { type: typePart, scope, subject, breaking };
}

/** Validate one commit header against commitlint rules. */
export function lintCommitHeader(header: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (header.length > 120) {
    errors.push('header-max-length: header 超过 120 字符');
  }
  const parsed = parseCommitHeader(header);
  if (parsed.type.length === 0) {
    errors.push('type-empty: 缺少提交类型（feat/fix/docs/…）');
  } else {
    if (parsed.type !== parsed.type.toLowerCase()) {
      errors.push(`type-case: type 必须小写（当前 ${parsed.type}）`);
    }
    if (!QUALITY_TYPES.includes(parsed.type)) {
      errors.push(`type-enum: type "${parsed.type}" 不在允许列表：${QUALITY_TYPES.join('/')}`);
    }
  }
  if (parsed.subject.length === 0) {
    errors.push('subject-empty: 缺少描述');
  } else if (parsed.subject.length > 100) {
    errors.push(`subject-max-length: 描述超过 100 字符（当前 ${parsed.subject.length}）`);
  }
  return { ok: errors.length === 0, errors };
}

/** Collect headers of the last N commits from raw `git log --format=%s` output. */
export function collectHeaders(rawLog: string): string[] {
  return rawLog.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}
