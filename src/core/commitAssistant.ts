/**
 * Commit assistant core (development-plan T-3.4 / G-16).
 * Pure logic — no VS Code imports.
 *
 * Dual-channel commit model (het-commit): the conventional type drives
 * semantic-release versioning; the emoji (canonical `type(:emoji:)`) drives
 * which CI pipeline runs, gated by metadata.workflow_triggers.*.
 */

export const COMMIT_TYPES = ['feat', 'fix', 'perf', 'docs', 'test', 'build', 'ci', 'refactor', 'style', 'chore'] as const;
export type CommitType = (typeof COMMIT_TYPES)[number];

/** Pipeline emoji cards surfaced in the UI (CI trigger superset). */
export interface TriggerEmoji {
  id: string;
  emoji: string;
  label: string;
  /** metadata.workflow_triggers key ('' when not gated). */
  switchKey: string;
}

export const TRIGGER_EMOJIS: TriggerEmoji[] = [
  { id: 'build', emoji: ':building_construction:', label: '构建', switchKey: 'build' },
  { id: 'tests', emoji: ':beer:', label: '测试', switchKey: 'tests' },
  { id: 'release', emoji: ':package:', label: '发版', switchKey: 'release' },
  { id: 'docs', emoji: ':book:', label: '文档', switchKey: 'docs' },
  { id: 'security', emoji: ':shield:', label: '安全', switchKey: 'security_scan' },
  { id: 'board', emoji: ':fire:', label: '上板', switchKey: '' },
];

/** Parse `git status --porcelain` lines (XY path) into entries. */
export interface ChangeEntry {
  path: string;
  staged: boolean;
  status: string;
}

export function parsePorcelain(raw: string): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.length < 4) {
      continue;
    }
    const xy = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (xy.includes('?') || xy.includes('!')) {
      out.push({ path, staged: false, status: 'untracked' });
    } else {
      const staged = xy[0] !== ' ' && xy[0] !== '?';
      const status = xy.trim() || 'modified';
      out.push({ path, staged, status });
    }
  }
  return out;
}

/** Map a changed path to its conventional type suggestion. */
export function typeForPath(relPath: string): CommitType {
  const p = relPath.replace(/\\/g, '/').toLowerCase();
  if (p.startsWith('test_package/')) {
    return 'test';
  }
  if (p.startsWith('benchmark/')) {
    return 'perf';
  }
  if (p.startsWith('docs/')) {
    return 'docs';
  }
  if (p.startsWith('.github/')) {
    return 'ci';
  }
  if (p.startsWith('include/') || p.startsWith('src/')) {
    return 'feat';
  }
  if (/(^|\/)(cmakelists\.txt|conanfile\.py|conandata\.yml|metadata\.json)$/.test(p)) {
    return 'build';
  }
  return 'chore';
}

/** Best aggregate type for a set of changed files (decisive-first). */
export function suggestType(paths: string[]): CommitType {
  const has = (prefixes: string[]): boolean =>
    paths.some((p) => {
      const n = p.replace(/\\/g, '/').toLowerCase();
      return prefixes.some((pfx) => n.startsWith(pfx));
    });
  if (has(['test_package/'])) {
    return 'test';
  }
  if (has(['docs/'])) {
    return 'docs';
  }
  if (has(['.github/'])) {
    return 'ci';
  }
  if (has(['benchmark/'])) {
    return 'perf';
  }
  if (has(['include/', 'src/'])) {
    return 'feat';
  }
  if (has(['cmakelists.txt', 'conanfile.py', 'conandata.yml', 'metadata.json'])) {
    return 'build';
  }
  return 'chore';
}

export interface SwitchState {
  /** metadata.workflow_triggers.* values. */
  triggers: Record<string, boolean>;
  buildType: string;
  triggerTests: boolean;
}

/**
 * Which emoji should be pre-selected for a type given the workflow switches
 * (mirrors gitmoji semantics: emoji only makes sense when its pipeline is on).
 */
export function defaultEmoji(type: CommitType, state: SwitchState): TriggerEmoji | null {
  const on = (key: string): boolean => state.triggers[key] === true;
  if (type === 'test') {
    return on('tests') && state.triggerTests && /debug/i.test(state.buildType) ? TRIGGER_EMOJIS[1] : null;
  }
  if (type === 'docs') {
    return on('docs') ? TRIGGER_EMOJIS[3] : null;
  }
  if (type === 'ci' || type === 'style' || type === 'refactor') {
    return on('security_scan') ? TRIGGER_EMOJIS[4] : null;
  }
  if (type === 'build') {
    return on('build') ? TRIGGER_EMOJIS[0] : null;
  }
  if (type === 'feat' || type === 'fix' || type === 'perf') {
    return on('build') ? TRIGGER_EMOJIS[0] : null;
  }
  return null;
}

/** Compose the canonical header: `type(:emoji:)!: subject` or `type: subject`. */
export function composeHeader(type: CommitType, emoji: string | null, breaking: boolean, subject: string): string {
  const scope = emoji ? `(${emoji})` : '';
  const bang = breaking ? '!' : '';
  return `${type}${scope}${bang}: ${subject.trim()}`;
}
