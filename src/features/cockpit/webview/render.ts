/**
 * Cockpit single-page renderer (gui-rework-plan §4).
 * Pure string builder — no VS Code imports (unit-testable).
 * Icon policy (§3.4): rail main items carry codicons; sub-items / lists are
 * text-only with ✓/✗ status marks.
 */

import { esc } from '../../ui';
import { PAGES, CockpitPage } from '../layout';
import { CockpitState, CockpitWizard } from '../state';

export interface CockpitAssets {
  codiconCss: string;
  lang?: CockpitLang;
}

export type CockpitLang = 'zh' | 'en';

/** Chrome-only i18n (page content stays on the zh base per the plan). */
function t(lang: CockpitLang, zh: string, en: string): string {
  return lang === 'en' ? en : zh;
}

/* ------------------------------------------------------------------ *
 * Page content payloads (P-G2 adapters feed these).
 * ------------------------------------------------------------------ */

export interface ToolChip {
  name: string;
  ok: boolean;
}

export interface TestSummaryPayload {
  passed?: number;
  failed?: number;
  skipped?: number;
}

export interface OverviewPayload {
  projectName?: string;
  version?: string;
  buildType?: string;
  healthScore?: number;
  tools: ToolChip[];
  lastBuildOk: boolean | null;
  lastTest: TestSummaryPayload | null;
}

export interface BuildTestPayload {
  lastBuildOk: boolean | null;
  lastTest: TestSummaryPayload | null;
}

export interface DepItemView {
  bucket: string;
  displayKey: string;
  conanName: string;
  version?: string;
  targets: string[];
}

export interface DepsPayload {
  items: DepItemView[];
  issues: string[];
}

export interface BenchPayload {
  platform: string;
  parsed: { complete: boolean; cases: [string, string][] } | null;
  note?: string;
}

export type PagePayload =
  | OverviewPayload
  | BuildTestPayload
  | DepsPayload
  | BenchPayload
  | SummaryPayload
  | Record<string, unknown>
  | undefined;

export interface SummaryAction {
  cmd: string;
  icon: string; // codicon suffix
  label: string;
}

export interface SummaryPayload {
  rows: [string, string][];
  actions: SummaryAction[];
  note?: string;
}

/** Text-only summary rows + primary action buttons (no icons on sub-items). */
export function summaryContent(p: SummaryPayload): string {
  const rows = p.rows.map(([k, v]) => `<div class="srow"><span class="sk">${esc(k)}</span><span class="sv">${esc(v)}</span></div>`).join('');
  const actions = p.actions
    .map((a) => `<button class="primary" data-cmd="${esc(a.cmd)}"><i class="codicon codicon-${a.icon}"></i>${esc(a.label)}</button>`)
    .join('');
  return `<div class="slist">${rows || '<div class="status">（暂无数据）</div>'}</div>
    <div class="actions">${actions}</div>
    ${p.note ? `<div class="status">${esc(p.note)}</div>` : ''}`;
}

function statusMark(ok: boolean | null | undefined): string {
  if (ok === undefined || ok === null) {
    return '·';
  }
  return ok ? '✓' : '✗';
}

function overviewContent(p: OverviewPayload): string {
  const health = p.healthScore === undefined ? '' : `<span class="chip ${p.healthScore >= 80 ? 'ok' : p.healthScore >= 50 ? 'warn' : 'fail'}">健康分 ${p.healthScore}</span>`;
  const tools = p.tools.map((t) => `<span class="status">${t.ok ? '✓' : '✗'} ${esc(t.name)}</span>`).join(' ');
  return `<div class="row">${health}</div>
    <div class="grid">
      <div class="card"><div class="ct">最近构建</div><div class="cv">${statusMark(p.lastBuildOk)} ${p.lastBuildOk === null ? '未运行' : p.lastBuildOk ? '成功' : '失败'}</div></div>
      <div class="card"><div class="ct">最近测试</div><div class="cv">${p.lastTest ? `${statusMark((p.lastTest.failed ?? 0) === 0)} ${p.lastTest.passed ?? 0}/${(p.lastTest.failed ?? 0) + (p.lastTest.passed ?? 0)}` : '未运行'}</div></div>
    </div>
    <div class="row">${tools}</div>
    <div class="actions">
      <button class="primary" data-cmd="het.test"><i class="codicon codicon-play"></i>构建并测试</button>
      <button class="primary" data-cmd="het.docs"><i class="codicon codicon-book"></i>文档</button>
      <button class="primary" data-cmd="het.quality"><i class="codicon codicon-shield"></i>质量</button>
      <button class="primary" data-cmd="het.release"><i class="codicon codicon-rocket"></i>发布</button>
    </div>`;
}

function buildTestContent(p: BuildTestPayload): string {
  const line = `最近构建 ${statusMark(p.lastBuildOk)} · 测试 ${p.lastTest ? `通过 ${p.lastTest.passed ?? 0} · 失败 ${p.lastTest.failed ?? 0} · 跳过 ${p.lastTest.skipped ?? 0}` : '未运行'}`;
  return `<div class="row"><span class="status">${line}</span></div>
    <div class="actions">
      <button class="primary" data-cmd="het.build"><i class="codicon codicon-tools"></i>构建</button>
      <button class="primary" data-cmd="het.test"><i class="codicon codicon-beaker"></i>构建并测试</button>
      <button data-cmd="het.showTestResults">查看测试结果</button>
    </div>
    <div class="placeholder">构建日志将自动出现在底部抽屉（运行中自动展开，完成后 3 秒收起）。</div>`;
}

const BUCKET_LABELS: Record<string, string> = {
  common: '公共 (common)',
  c: 'C (c)',
  cpp: 'C++ (cpp)',
  infra: '基础设施 (infra)',
};

function depsContent(p: DepsPayload): string {
  const items = p.items.length
    ? p.items
        .map(
          (i) => `<div class="drow">
      <span class="dk">${esc(BUCKET_LABELS[i.bucket] ?? i.bucket)}</span>
      <span class="dv"><b>${esc(i.displayKey)}</b><span class="dim"> ${esc(i.conanName)}${i.version ? '@' + esc(i.version) : ''}</span></span>
      <span class="dv dim">${esc(i.targets.join(', ') || '—')}</span>
      <button class="textbtn" data-page-action="deps:remove" data-arg-bucket="${esc(i.bucket)}" data-arg-key="${esc(i.displayKey)}">移除</button>
    </div>`,
        )
        .join('')
    : '<div class="status">（暂无依赖）</div>';
  const bucketOptions = Object.entries(BUCKET_LABELS).map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('');
  return `<div class="slist">${items}</div>
    ${p.issues.length ? `<div class="warn">${p.issues.map((x) => esc(x)).join('<br>')}</div>` : ''}
    <form class="addform" data-action="deps:add">
      <input name="conanName" placeholder="conan 包名（如 zlib）" required>
      <input name="version" placeholder="版本（如 1.3.1）" required>
      <input name="targets" placeholder="目标（逗号分隔，可空）">
      <select name="bucket">${bucketOptions}</select>
      <button class="primary" type="submit"><i class="codicon codicon-add"></i>添加依赖</button>
    </form>
    <div class="status">增删均先弹窗确认，随后原子写入 conandata.yml 与 metadata.json。</div>`;
}

function benchContent(p: BenchPayload): string {
  const table = p.parsed
    ? `<div class="slist">${
        p.parsed.cases.length
          ? p.parsed.cases
              .map(([n, v]) => `<div class="srow"><span class="sk">${esc(n)}</span><span class="sv">${esc(v)}</span></div>`)
              .join('')
          : '<div class="status">未解析到 RESULT 行</div>'
      }
      <div class="status">${p.parsed.complete ? '✓ 协议完整（START/END 齐全）' : '✗ 协议不完整（缺少 START/END）'}</div></div>`
    : '';
  return `<div class="row"><span class="status">平台：${esc(p.platform)}</span></div>
    <form data-action="bench:parse">
      <textarea name="text" rows="8" placeholder="粘贴模拟串口输出，如：&#10;BENCHMARK_START&#10;RESULT|matmul_4x4|12345&#10;BENCHMARK_END"></textarea>
      <button class="primary" type="submit"><i class="codicon codicon-chrome-maximize"></i>解析协议输出</button>
    </form>
    ${table}
    ${p.note ? `<div class="status">${esc(p.note)}</div>` : ''}`;
}

/** Render the full main-region HTML for a page with its payload (P-G2). */
export function buildPageContentHtml(page: CockpitPage, payload: PagePayload): string {
  const def = PAGES.find((p) => p.id === page) ?? PAGES[0];
  const head = `<h1>${esc(def.label)}</h1><div class="sub">${esc(def.hint)}</div>`;
  if (page === 'overview') {
    return `<section class="page">${head}${overviewContent(payload as OverviewPayload)}</section>`;
  }
  if (page === 'buildTest') {
    return `<section class="page">${head}${buildTestContent(payload as BuildTestPayload)}</section>`;
  }
  if (page === 'deps') {
    return `<section class="page">${head}${depsContent((payload as DepsPayload) ?? { items: [], issues: [] })}</section>`;
  }
  if (page === 'bench') {
    return `<section class="page">${head}${benchContent((payload as BenchPayload) ?? { platform: '未检测', parsed: null })}</section>`;
  }
  if (payload && typeof payload === 'object' && 'rows' in payload && 'actions' in payload) {
    return `<section class="page">${head}${summaryContent(payload as SummaryPayload)}</section>`;
  }
  return `<section class="page">${head}<div class="placeholder">（P-G2 将在此接入「${esc(def.label)}」页面内容；本页为驾驶舱骨架占位）</div></section>`;
}

/** P-G4 host-supplied wizard facts (template source, destination parent). */
export interface CockpitWizardInfo {
  templateRepo: string;
  templateRef: string;
  modeLabel: string;
  parentDir: string;
}

const WIZARD_STEPS = ['模板源', '身份', '构建参数', '开关', '确认'];

function selOption(value: string, label: string, current: string | undefined): string {
  return `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;
}

/** Five-step onboarding overlay (P-G4). */
export function renderWizardRegion(
  wizard: CockpitWizard | null,
  info: CockpitWizardInfo,
  draft: Record<string, string>,
  lang: CockpitLang = 'zh',
): string {
  if (!wizard) {
    return '';
  }
  const dots = WIZARD_STEPS.map((label, i) => {
    const cls = i + 1 === wizard.step ? 'cur' : i + 1 < wizard.step ? 'done' : '';
    const localized = t(lang, label, ['Template', 'Identity', 'Build', 'Switches', 'Confirm'][i]);
    return `<span class="wstep ${cls}">${i + 1} ${esc(localized)}</span>`;
  }).join('');

  const row = (k: string, v: string): string => `<div class="srow"><span class="sk">${esc(k)}</span><span class="sv">${esc(v)}</span></div>`;
  let body = '';
  if (wizard.step === 1) {
    body = `<div class="slist">
      ${row(t(lang, '模板仓库', 'Template repo'), info.templateRepo)}
      ${row(t(lang, '固定 ref', 'Pinned ref'), info.templateRef)}
      ${row(t(lang, '模板源', 'Source'), info.modeLabel)}
    </div>
    <div class="status">${t(lang, '新项目将从模板复制骨架 → 改写 metadata.json（name/description）→ git init + 基线提交 → 记录 .het/template-ref.json。', 'Copy the template skeleton → rewrite metadata.json (name/description) → git init + baseline commit → record .het/template-ref.json.')}</div>`;
  } else if (wizard.step === 2) {
    body = `<form data-wizard="submit">
      <label>${t(lang, '项目名（字母/数字/下划线/连字符）', 'Project name (letters/digits/_/-)')}
        <input name="name" value="${esc(draft.name ?? '')}" placeholder="my-lib" required>
      </label>
      <label>${t(lang, '描述', 'Description')}
        <input name="description" value="${esc(draft.description ?? '')}" placeholder="${t(lang, '一句话描述', 'one-line description')}">
      </label>
    </form>`;
  } else if (wizard.step === 3) {
    body = `<form data-wizard="submit">
      <label>build_type
        <select name="buildType">
          ${selOption('Debug', 'Debug', draft.buildType)}
          ${selOption('Release', 'Release', draft.buildType)}
          ${selOption('RelWithDebInfo', 'RelWithDebInfo', draft.buildType)}
          ${selOption('MinSizeRel', 'MinSizeRel', draft.buildType)}
        </select>
      </label>
      <label>build_cppstd
        <select name="cppstd">
          ${selOption('11', 'C++11', draft.cppstd)}
          ${selOption('14', 'C++14', draft.cppstd)}
          ${selOption('17', 'C++17', draft.cppstd)}
          ${selOption('20', 'C++20', draft.cppstd)}
          ${selOption('23', 'C++23', draft.cppstd)}
        </select>
      </label>
    </form>`;
  } else if (wizard.step === 4) {
    body = `<form data-wizard="submit">
      <label>enable_python_bindings
        <select name="pybind">
          ${selOption('no', '否（默认）', draft.pybind)}
          ${selOption('yes', '是', draft.pybind)}
        </select>
      </label>
    </form>`;
  } else {
    const dest = joinWeb(draft.name ?? 'my-lib', info.parentDir);
    body = `<div class="slist">
      ${row(t(lang, '项目名', 'Project'), draft.name ?? '—')}
      ${row(t(lang, '目标目录', 'Destination'), dest)}
      ${row(t(lang, '模板源', 'Source'), info.modeLabel)}
      ${row(t(lang, '构建参数', 'Build params'), `${draft.buildType ?? 'Debug'} · C++${draft.cppstd ?? '17'}`)}
      ${row(t(lang, 'Python 绑定', 'Python bindings'), draft.pybind === 'yes' ? t(lang, '开启', 'On') : t(lang, '关闭', 'Off'))}
    </div>
    <div class="status">${t(lang, '确认后将：复制模板 → 改写 metadata.json（备份 .bak）→ git init + 基线提交 → 记录模板 ref。离线环境使用本地模板副本。', 'Will: copy template → rewrite metadata.json (.bak backup) → git init + baseline commit → record template ref. Offline uses the local template copy.')}</div>`;
  }

  const err = wizard.error ? `<div class="warn">${esc(wizard.error)}</div>` : '';
  const back = wizard.step > 1 ? `<button data-wizard="prev">${t(lang, '上一步', 'Back')}</button>` : '';
  const next =
    wizard.step < 5 ? `<button class="primary" data-wizard="next">${t(lang, '下一步', 'Next')}</button>` : `<button class="primary" data-wizard="finish">${t(lang, '创建项目', 'Create project')}</button>`;
  return `<div class="wiz-mask">
    <div class="wiz-box">
      <div class="wiz-head"><span class="wiz-title">${t(lang, '新项目向导', 'New project wizard')}</span><button class="textbtn" data-wizard="close">✕</button></div>
      <div class="wiz-dots">${dots}</div>
      ${body}
      ${err}
      <div class="actions">${back}${next}</div>
    </div>
  </div>`;
}

/** Join a project name onto a parent dir (webview-safe, '/' separators only). */
function joinWeb(name: string, parent: string): string {
  const n = name.replace(/[\\/]/g, '');
  return `${parent.replace(/[\\]+$/u, '')}/${n}`;
}

function railHtml(active: CockpitPage): string {
  return PAGES.map(
    (p) =>
      `<button class="rail-item ${p.id === active ? 'active' : ''}" data-page="${p.id}" title="${esc(p.hint)}">
        <i class="codicon codicon-${p.icon}"></i><span>${esc(p.label)}</span>
      </button>`,
  ).join('');
}

function topHtml(s: CockpitState, lang: CockpitLang = 'zh'): string {
  const health = s.top.health === null ? '' : `<span class="chip ${s.top.health >= 80 ? 'ok' : s.top.health >= 50 ? 'warn' : 'fail'}">${t(lang, '健康分', 'Health')} ${s.top.health}</span>`;
  const tpl = s.top.templateBehind > 0 ? `<span class="chip warn">${t(lang, '●模板可更新', '● Template update')} ${s.top.templateBehind}</span>` : '';
  const run = s.top.running ? `<span class="chip running"><span class="spin">●</span> ${esc(s.top.running)}</span>` : '';
  const name = s.top.projectName ? `<span class="proj"><i class="codicon codicon-package"></i>${esc(s.top.projectName)}</span>` : '<span class="proj dim">HeT DevTools</span>';
  const np = `<button class="chip action" data-wizard="open">${t(lang, '＋ 新项目', '+ New project')}</button>`;
  return `${name}${health}${tpl}${run}<span class="flex"></span>${np}`;
}

function mainHtml(s: CockpitState): string {
  const def = PAGES.find((p) => p.id === s.page) ?? PAGES[0];
  const primaryActions =
    s.page === 'overview'
      ? `<div class="actions">
          <button class="primary" data-cmd="het.build"><i class="codicon codicon-play"></i>构建并测试</button>
          <button class="primary" data-cmd="het.docs"><i class="codicon codicon-book"></i>文档</button>
          <button class="primary" data-cmd="het.quality"><i class="codicon codicon-shield"></i>质量</button>
          <button class="primary" data-cmd="het.release"><i class="codicon codicon-rocket"></i>发布</button>
        </div>`
      : '';
  const buildState =
    s.page === 'buildTest' && s.lastBuildOk !== null
      ? `<div class="row"><span class="status">${s.lastBuildOk ? '✓ 最近构建成功' : '✗ 最近构建失败'}</span></div>`
      : '';
  return `<section class="page">
    <h1>${esc(def.label)}</h1>
    <div class="sub">${esc(def.hint)}</div>
    ${primaryActions}
    ${buildState}
    <div class="placeholder">（P-G2 将在此接入「${esc(def.label)}」页面内容；本页为驾驶舱骨架占位）</div>
  </section>`;
}

function drawerHtml(s: CockpitState, lang: CockpitLang = 'zh'): string {
  const collapsed = t(lang, '日志 · 问题 · 向导', 'Log · Issues · Wizard');
  if (!s.drawer.expanded) {
    return `<div class="drawer collapsed" data-toggle="drawer"><span class="caret">▸</span> ${esc(collapsed)}</div>`;
  }
  const body =
    s.drawer.kind === 'log'
      ? `<pre>${s.drawer.lines.map((l) => esc(l)).join('\n') || '（暂无输出）'}</pre>`
      : s.drawer.kind === 'issues'
        ? `<div class="warn">${esc(s.drawer.title)} <button data-cmd="workbench.actions.view.problems">查看问题</button></div>`
        : '';
  return `<div class="drawer expanded">
    <div class="drawer-head" data-toggle="drawer"><span class="caret">▾</span> ${esc(s.drawer.title || collapsed)}</div>
    ${body}
  </div>`;
}

/** Render the full cockpit document for the given state. */
export function buildCockpitHtml(
  s: CockpitState,
  assets: CockpitAssets,
  wizardInfo?: CockpitWizardInfo,
  wizardDraft?: Record<string, string>,
): string {
  const lang: CockpitLang = assets.lang ?? 'zh';
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HeT DevTools 驾驶舱</title>
<link rel="stylesheet" href="${esc(assets.codiconCss)}">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: 10px; padding: 6px 12px;
    border-bottom: 1px solid var(--vscode-widget-border,#333); background: var(--vscode-editorWidget-background); font-size: 12px; }
  .top .proj { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
  .top .dim { opacity: .6; }
  .chip { padding: 2px 8px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .chip.ok { background: #388a34; color: #fff; }
  .chip.warn { background: #9c6b1c; color: #fff; }
  .chip.fail { background: #a1260d; color: #fff; }
  .spin { display: inline-block; animation: het-spin 1s linear infinite; }
  @keyframes het-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .body { display: flex; flex: 1; overflow: hidden; }
  .rail { width: 172px; min-width: 172px; overflow-y: auto; padding: 6px;
    border-right: 1px solid var(--vscode-widget-border,#333); background: var(--vscode-sideBar-background); }
  .rail-item { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
    background: none; border: none; color: var(--vscode-foreground); padding: 6px 10px; margin: 1px 0;
    border-radius: 5px; cursor: pointer; font-size: 13px; }
  .rail-item i { width: 16px; }
  .rail-item:hover { background: var(--vscode-list-hoverBackground); }
  .rail-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .main { flex: 1; overflow-y: auto; padding: 14px 18px; }
  .page h1 { font-size: 17px; margin: 0 0 2px; }
  .page .sub { opacity: .7; font-size: 12px; margin-bottom: 10px; }
  .placeholder { margin-top: 14px; padding: 22px; text-align: center; opacity: .55; font-size: 12px;
    border: 1px dashed var(--vscode-widget-border,#444); border-radius: 8px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
  button.primary { display: inline-flex; align-items: center; gap: 6px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
  button.primary i { width: 16px; }
  .row { margin: 6px 0; font-size: 12px; }
  .status { font-size: 12px; }
  .drawer { border-top: 1px solid var(--vscode-widget-border,#333); background: var(--vscode-editorWidget-background); }
  .drawer.collapsed { padding: 6px 12px; font-size: 12px; opacity: .8; cursor: pointer; }
  .drawer-head { padding: 6px 12px; font-size: 12px; cursor: pointer; opacity: .9; }
  .caret { display: inline-block; width: 12px; }
  .drawer pre { margin: 0; padding: 6px 12px; max-height: 180px; overflow-y: auto;
    font-size: 11px; font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background,#111); }
  .warn { padding: 6px 12px; font-size: 12px; }
  .grid { display: flex; gap: 10px; margin: 8px 0; }
  .slist { margin: 8px 0; }
  .srow { display: flex; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border,#2b2b2b); font-size: 12px; }
  .srow .sk { width: 130px; opacity: .75; flex-shrink: 0; }
  .srow .sv { flex: 1; }
  .drow { display: flex; gap: 12px; align-items: center; padding: 4px 0;
    border-bottom: 1px solid var(--vscode-widget-border,#2b2b2b); font-size: 12px; }
  .drow .dk { width: 120px; opacity: .75; flex-shrink: 0; }
  .drow .dv { flex: 1; }
  .dim { opacity: .65; }
  button.textbtn { background: none; border: none; color: var(--vscode-textLink-foreground);
    cursor: pointer; font-size: 12px; padding: 0; }
  .addform { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
  .addform input, .addform select { background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border,#555); border-radius: 4px; padding: 5px 8px; font-size: 12px; min-width: 120px; }
  textarea { width: 100%; max-width: 640px; box-sizing: border-box; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border,#555); border-radius: 4px;
    padding: 6px 8px; font-family: var(--vscode-editor-font-family); font-size: 12px; }
  form[data-action] { margin: 10px 0; }
  .card { border: 1px solid var(--vscode-widget-border,#333); border-radius: 8px;
    padding: 10px 14px; background: var(--vscode-editorWidget-background); min-width: 160px; }
  .card .ct { font-size: 11px; opacity: .7; }
  .card .cv { font-size: 15px; font-weight: 600; margin-top: 4px; }
  .flex { flex: 1; }
  button.chip.action { border: none; cursor: pointer; font-size: 12px; }
  .wiz-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
    align-items: center; justify-content: center; z-index: 10; }
  .wiz-box { width: 560px; max-width: 92vw; max-height: 84vh; overflow-y: auto;
    background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border,#444);
    border-radius: 8px; padding: 14px 18px; }
  .wiz-head { display: flex; align-items: center; justify-content: space-between; }
  .wiz-title { font-weight: 600; font-size: 14px; }
  .wiz-dots { display: flex; gap: 6px; margin: 10px 0 12px; flex-wrap: wrap; }
  .wstep { font-size: 11px; padding: 2px 8px; border-radius: 10px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); opacity: .55; }
  .wstep.cur { opacity: 1; }
  .wstep.done { background: #388a34; color: #fff; }
  .wiz-box form { display: flex; flex-direction: column; gap: 10px; margin: 10px 0; }
  .wiz-box label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .wiz-box input, .wiz-box select { background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border,#555); border-radius: 4px; padding: 5px 8px; font-size: 12px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
</style>
</head>
<body>
  <div class="top" id="top">${topHtml(s, lang)}</div>
  <div class="body">
    <nav class="rail" id="rail">${railHtml(s.page)}</nav>
    <main class="main" id="main">${mainHtml(s)}</main>
  </div>
  <div id="drawer">${drawerHtml(s, lang)}</div>
  <div id="wizard">${renderWizardRegion(s.wizard, wizardInfo ?? { templateRepo: '', templateRef: '', modeLabel: '', parentDir: '' }, wizardDraft ?? {}, lang)}</div>
  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      const escH = (v) => String(v ?? '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
      document.getElementById('rail').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page]');
        if (btn) { vscode.postMessage({ type: 'cockpit:navigate', page: btn.getAttribute('data-page') }); }
      });
      document.getElementById('main').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cmd]');
        if (btn) { vscode.postMessage({ type: 'page:action', command: btn.getAttribute('data-cmd') }); return; }
        const pa = e.target.closest('[data-page-action]');
        if (pa) {
          const data = {};
          for (const a of pa.attributes) {
            if (a.name.indexOf('data-arg-') === 0) { data[a.name.slice('data-arg-'.length)] = a.value; }
          }
          vscode.postMessage({ type: 'cockpit:page:action', action: pa.getAttribute('data-page-action'), data });
        }
      });
      document.getElementById('main').addEventListener('submit', (e) => {
        const form = e.target.closest('form[data-action]');
        if (!form) { return; }
        e.preventDefault();
        const data = {};
        new FormData(form).forEach((v, k) => { data[k] = String(v); });
        vscode.postMessage({ type: 'cockpit:page:action', action: form.getAttribute('data-action'), data });
      });
      document.getElementById('drawer').addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle="drawer"]')) { vscode.postMessage({ type: 'drawer:toggle', expand: !document.getElementById('drawer').firstElementChild.classList.contains('expanded') }); }
        const btn = e.target.closest('[data-cmd]');
        if (btn) { vscode.postMessage({ type: 'page:action', command: btn.getAttribute('data-cmd') }); }
      });
      document.getElementById('top').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-wizard]');
        if (btn) { vscode.postMessage({ type: 'cockpit:wizard', action: btn.getAttribute('data-wizard') }); }
      });
      document.getElementById('wizard').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-wizard]');
        if (btn && btn.getAttribute('data-wizard') !== 'submit') {
          vscode.postMessage({ type: 'cockpit:wizard', action: btn.getAttribute('data-wizard') });
        }
      });
      document.getElementById('wizard').addEventListener('submit', (e) => {
        const form = e.target.closest('form[data-wizard="submit"]');
        if (!form) { return; }
        e.preventDefault();
        const data = {};
        new FormData(form).forEach((v, k) => { data[k] = String(v); });
        vscode.postMessage({ type: 'cockpit:wizard', action: 'submit', data });
      });
      window.addEventListener('message', (e) => {
        const m = e.data;
        if (m && m.type === 'cockpit:state' && m.regions) {
          document.getElementById('top').innerHTML = m.regions.top;
          document.getElementById('rail').innerHTML = m.regions.rail;
          document.getElementById('main').innerHTML = m.regions.main;
          document.getElementById('drawer').innerHTML = m.regions.drawer;
          document.getElementById('wizard').innerHTML = m.regions.wizard;
        }
      });
    })();
  </script>
</body>
</html>`;
}

/** Render just the mutable regions (top/rail/main/drawer) from a state. */
export function renderCockpitRegions(
  s: CockpitState,
  lang: CockpitLang = 'zh',
): { top: string; rail: string; main: string; drawer: string } {
  return { top: topHtml(s, lang), rail: railHtml(s.page), main: mainHtml(s), drawer: drawerHtml(s, lang) };
}
