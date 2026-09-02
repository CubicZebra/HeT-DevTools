/**
 * Gitmoji / pipeline-trigger table.
 * Fact source: fcpp `.github/skills/_shared/gitmoji.md` (do not duplicate elsewhere).
 */

export type ConventionalType =
  | 'feat'
  | 'fix'
  | 'perf'
  | 'docs'
  | 'test'
  | 'build'
  | 'ci'
  | 'refactor'
  | 'style'
  | 'chore';

export type PipelineKey = 'build' | 'tests' | 'release' | 'docs' | 'security' | 'board';

/** CI pipeline emoji triggers (`<type>(<emoji>): ...` in the commit message). */
export interface PipelineTrigger {
  key: PipelineKey;
  /** gitmoji code, e.g. ':building_construction:' (parsed by fcpp CI). */
  code: string;
  /** Display emoji for the UI. */
  emoji: string;
  /** metadata.json switch that gates this pipeline (may be undefined = no switch). */
  gate?: string;
  labelZh: string;
  labelEn: string;
}

export const PIPELINE_TRIGGERS: PipelineTrigger[] = [
  { key: 'build', code: ':building_construction:', emoji: '🏗️', gate: 'workflow_triggers.build', labelZh: '构建', labelEn: 'Build' },
  { key: 'tests', code: ':beer:', emoji: '🍺', gate: 'workflow_triggers.tests', labelZh: '测试', labelEn: 'Tests' },
  { key: 'release', code: ':package:', emoji: '📦', gate: 'workflow_triggers.release', labelZh: '发版', labelEn: 'Release' },
  { key: 'docs', code: ':book:', emoji: '📖', gate: 'workflow_triggers.docs', labelZh: '文档', labelEn: 'Docs' },
  { key: 'security', code: ':shield:', emoji: '🛡️', gate: 'workflow_triggers.security_scan', labelZh: '安全', labelEn: 'Security' },
  { key: 'board', code: ':fire:', emoji: '🔥', labelZh: '上板', labelEn: 'Board' },
];

export interface ConventionalTypeEntry {
  type: ConventionalType;
  /** Suggested display emoji for this commit type. */
  emoji: string;
  labelZh: string;
  labelEn: string;
}

export const CONVENTIONAL_TYPES: ConventionalTypeEntry[] = [
  { type: 'feat', emoji: '✨', labelZh: '新功能', labelEn: 'Feature' },
  { type: 'fix', emoji: '🐛', labelZh: '缺陷修复', labelEn: 'Bug fix' },
  { type: 'perf', emoji: '⚡', labelZh: '性能优化', labelEn: 'Performance' },
  { type: 'docs', emoji: '📖', labelZh: '文档', labelEn: 'Docs' },
  { type: 'test', emoji: '🧪', labelZh: '测试', labelEn: 'Tests' },
  { type: 'build', emoji: '🏗️', labelZh: '构建', labelEn: 'Build' },
  { type: 'ci', emoji: '🔧', labelZh: 'CI 配置', labelEn: 'CI config' },
  { type: 'refactor', emoji: '♻️', labelZh: '重构', labelEn: 'Refactor' },
  { type: 'style', emoji: '🎨', labelZh: '代码风格', labelEn: 'Style' },
  { type: 'chore', emoji: '🔩', labelZh: '杂项', labelEn: 'Chore' },
];

export function findPipeline(key: PipelineKey): PipelineTrigger | undefined {
  return PIPELINE_TRIGGERS.find((p) => p.key === key);
}

export function findType(type: ConventionalType): ConventionalTypeEntry | undefined {
  return CONVENTIONAL_TYPES.find((c) => c.type === type);
}
