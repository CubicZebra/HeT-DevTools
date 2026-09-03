/**
 * Cockpit layout registry (gui-rework-plan §3 IA).
 * Pure — no VS Code imports. Main items carry codicon names (single-color);
 * sub-items inside pages stay icon-free per the restraint policy (§3.4).
 */

export type CockpitPage =
  | 'overview'
  | 'buildTest'
  | 'deps'
  | 'moduleTest'
  | 'docs'
  | 'quality'
  | 'commit'
  | 'release'
  | 'bench'
  | 'collab'
  | 'settings';

export interface PageDef {
  id: CockpitPage;
  label: string;
  icon: string; // codicon class suffix, e.g. "home" → codicon-home
  hint: string;
}

export const PAGES: PageDef[] = [
  { id: 'overview', label: '概览', icon: 'home', hint: '健康分 · 环境 · 动作' },
  { id: 'buildTest', label: '构建与测试', icon: 'beaker', hint: 'conan create · GTest/CTest' },
  { id: 'deps', label: '依赖', icon: 'package', hint: '四桶依赖增删' },
  { id: 'moduleTest', label: '模块与测试', icon: 'symbol-method', hint: '新增模块 · 测试生成 A/B' },
  { id: 'docs', label: '文档', icon: 'book', hint: 'Doxygen + Sphinx 双语' },
  { id: 'quality', label: '质量', icon: 'shield', hint: 'format/tidy/schema/commitlint' },
  { id: 'commit', label: '提交', icon: 'git-commit', hint: 'type(:emoji:) 双通道' },
  { id: 'release', label: '发布', icon: 'rocket', hint: '开关 · Preflight' },
  { id: 'bench', label: '上板', icon: 'chip', hint: '--no-flash · 采集解析' },
  { id: 'collab', label: '协作与审计', icon: 'globe', hint: 'CI · 审计 · 专利 · 模板' },
  { id: 'settings', label: '设置', icon: 'settings-gear', hint: 'metadata.json 表单' },
];

export function pageDef(id: CockpitPage): PageDef {
  return PAGES.find((p) => p.id === id) ?? PAGES[0];
}

export function isCockpitPage(value: string): value is CockpitPage {
  return PAGES.some((p) => p.id === value);
}
