/**
 * Cockpit single-page renderer (gui-rework-plan §4).
 * Pure string builder — no VS Code imports (unit-testable).
 * Icon policy (§3.4): rail main items carry codicons; sub-items / lists are
 * text-only with ✓/✗ status marks.
 */

import { esc } from '../../ui';
import { PAGES, CockpitPage } from '../layout';
import { CockpitState } from '../state';

export interface CockpitAssets {
  codiconCss: string;
}

function railHtml(active: CockpitPage): string {
  return PAGES.map(
    (p) =>
      `<button class="rail-item ${p.id === active ? 'active' : ''}" data-page="${p.id}" title="${esc(p.hint)}">
        <i class="codicon codicon-${p.icon}"></i><span>${esc(p.label)}</span>
      </button>`,
  ).join('');
}

function topHtml(s: CockpitState): string {
  const health = s.top.health === null ? '' : `<span class="chip ${s.top.health >= 80 ? 'ok' : s.top.health >= 50 ? 'warn' : 'fail'}">健康分 ${s.top.health}</span>`;
  const tpl = s.top.templateBehind > 0 ? `<span class="chip warn">●模板可更新 ${s.top.templateBehind}</span>` : '';
  const run = s.top.running ? `<span class="chip running"><span class="spin">●</span> ${esc(s.top.running)}</span>` : '';
  const name = s.top.projectName ? `<span class="proj"><i class="codicon codicon-package"></i>${esc(s.top.projectName)}</span>` : '<span class="proj dim">HeT DevTools</span>';
  return `${name}${health}${tpl}${run}`;
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

function drawerHtml(s: CockpitState): string {
  const collapsed = `日志 · 问题 · 向导`;
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
export function buildCockpitHtml(s: CockpitState, assets: CockpitAssets): string {
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
</style>
</head>
<body>
  <div class="top" id="top">${topHtml(s)}</div>
  <div class="body">
    <nav class="rail" id="rail">${railHtml(s.page)}</nav>
    <main class="main" id="main">${mainHtml(s)}</main>
  </div>
  <div id="drawer">${drawerHtml(s)}</div>
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
        if (btn) { vscode.postMessage({ type: 'page:action', command: btn.getAttribute('data-cmd') }); }
      });
      document.getElementById('drawer').addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle="drawer"]')) { vscode.postMessage({ type: 'drawer:toggle', expand: !document.getElementById('drawer').firstElementChild.classList.contains('expanded') }); }
        const btn = e.target.closest('[data-cmd]');
        if (btn) { vscode.postMessage({ type: 'page:action', command: btn.getAttribute('data-cmd') }); }
      });
      window.addEventListener('message', (e) => {
        const m = e.data;
        if (m && m.type === 'cockpit:state' && m.regions) {
          document.getElementById('top').innerHTML = m.regions.top;
          document.getElementById('rail').innerHTML = m.regions.rail;
          document.getElementById('main').innerHTML = m.regions.main;
          document.getElementById('drawer').innerHTML = m.regions.drawer;
        }
      });
    })();
  </script>
</body>
</html>`;
}

/** Render just the mutable regions (top/rail/main/drawer) from a state. */
export function renderCockpitRegions(s: CockpitState): { top: string; rail: string; main: string; drawer: string } {
  return { top: topHtml(s), rail: railHtml(s.page), main: mainHtml(s), drawer: drawerHtml(s) };
}
