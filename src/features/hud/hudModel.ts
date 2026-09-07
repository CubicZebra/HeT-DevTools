/**
 * V4-6 Level-2 HUD card — pure model + HTML builder.
 *
 * The HUD is a single-instance webview that opens when the chip is clicked:
 * rich stats (health/build/test/coverage), a provider/runtime line (V4-1),
 * env rows, and real action buttons with 1..9 keyboard shortcuts. The HTML is
 * built here (pure) so unit tests / the zero-manual harness can assert the
 * structure (buttons, gitmoji semantics, font-size injection, no triggers
 * colliding with the fcpp CI table).
 */
import { esc } from '../ui';

export type Tone = 'ok' | 'warn' | 'fail' | 'plain';

/** One interactive action (button + optional 1..9 shortcut). */
export interface HudAction {
  /** 1..9 — keyboard shortcut (undefined = click-only). */
  digit?: number;
  /** fcpp gitmoji glyph where the action maps to a CI semantic; else visual. */
  icon: string;
  label: string;
  detail?: string;
  cmd: string;
}

export interface HudEnvRow {
  label: string;
  value: string;
  tone: Tone;
  /** V5-7 dual-line: the REAL binding — absolute/lane path or source note. */
  path?: string;
  /** Optional per-row action label (e.g. 详情/打开). */
  actionLabel?: string;
  /** Command to run when the row action is clicked. */
  action?: string;
}

export interface HudModel {
  title: string;
  health: number | null;
  running: string | null;
  lastBuildOk: boolean | null;
  test: { passed: number; failed: number; skipped: number } | null;
  coverage: number | null;
  buildAgo: string | null;
  /** V4-1 provider decision line. */
  provider: { label: string; coverage: 'full' | 'partial' | 'none' } | null;
  runtime: string | null;
  env: HudEnvRow[];
  actions: HudAction[];
  templateBehind: number;
}

/** The 10 monitor actions (mirror of the v3 chip QuickPick). */
export function defaultHudActions(): HudAction[] {
  return [
    { digit: 1, icon: '🏠', label: '打开仪表盘', detail: '健康分 · 环境 · 动作', cmd: 'het.dashboard' },
    { digit: 2, icon: '🍺', label: '构建并测试', detail: 'conan create + GTest', cmd: 'het.test' },
    { digit: 3, icon: '🏗️', label: '仅构建', detail: 'conan create', cmd: 'het.build' },
    { digit: 4, icon: '🧩', label: '依赖', detail: 'QuickPick 搜索添加', cmd: 'het.addDependency' },
    { digit: 5, icon: '📖', label: '文档中心', detail: 'Doxygen + Sphinx', cmd: 'het.docs' },
    { digit: 6, icon: '🛡️', label: '质量与安全', detail: 'format/tidy/schema/commitlint', cmd: 'het.quality' },
    { digit: 7, icon: '💬', label: '提交助手', detail: 'type(:emoji:) 规范提交', cmd: 'het.commit' },
    { digit: 8, icon: '📦', label: '发布', detail: 'Preflight + 门禁', cmd: 'het.release' },
    { digit: 9, icon: '📋', label: '测试结果', detail: '最近一次运行明细', cmd: 'het.showTestResults' },
    { icon: '❤️', label: '一键体检', detail: '全维度健康检查', cmd: 'het.healthCheck' },
  ];
}

function toneClass(t: Tone): string {
  return t === 'ok' ? 'ok' : t === 'fail' ? 'fail' : t === 'warn' ? 'warn' : 'plain';
}

/** Build the HUD card HTML (self-contained, theme-aware, font-size from model). */
export function hudHtml(m: HudModel, fontSize: number): string {
  const health = m.health === null ? '—' : `${m.health}/100`;
  const healthTone: Tone = m.health === null ? 'plain' : m.health >= 80 ? 'ok' : m.health >= 50 ? 'warn' : 'fail';
  const buildTxt = m.lastBuildOk === null ? '未运行' : m.lastBuildOk ? '成功' : '失败';
  const buildTone: Tone = m.lastBuildOk === null ? 'plain' : m.lastBuildOk ? 'ok' : 'fail';
  const covTxt = m.coverage === null ? '—' : `${m.coverage}%`;
  const testTxt = m.test ? `${m.test.passed}/${m.test.passed + m.test.failed + m.test.skipped}` : '—';
  const testTone: Tone = m.test ? (m.test.failed > 0 ? 'fail' : 'ok') : 'plain';
  const provTone: Tone = m.provider ? (m.provider.coverage === 'full' ? 'ok' : m.provider.coverage === 'partial' ? 'warn' : 'fail') : 'plain';

  const stat = (icon: string, label: string, value: string, tone: Tone, sub = ''): string => `
    <div class="stat">
      <div class="stat-icon">${icon}</div>
      <div class="stat-body"><div class="stat-value ${toneClass(tone)}">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}</div>
    </div>`;

  const envRows = m.env
    .map(
      (r) => `<div class="env-row">
        <span class="dot ${toneClass(r.tone)}">${r.tone === 'ok' ? '✓' : r.tone === 'fail' ? '✗' : r.tone === 'warn' ? '!' : '·'}</span>
        <div class="env-body">
          <div class="env-line"><span class="env-label">${esc(r.label)}</span><span class="env-value">${esc(r.value)}</span></div>
          ${r.path ? `<div class="env-path">${esc(r.path)}</div>` : ''}
        </div>
        ${r.action ? `<button class="link" data-action="${esc(r.action)}">${esc(r.actionLabel ?? '打开')}</button>` : ''}
      </div>`,
    )
    .join('');

  const actions = m.actions
    .map(
      (a) => `<button class="act" data-action="${esc(a.cmd)}" title="${esc(a.detail ?? '')}">
          ${a.digit ? `<span class="key">${a.digit}</span>` : ''}<span class="act-icon">${a.icon}</span>${esc(a.label)}
        </button>`,
    )
    .join('');

  const badges = [
    `<span class="badge ${toneClass(healthTone)}">❤️ 健康 ${healthTone === 'ok' ? health : healthTone === 'warn' ? health : health}</span>`,
    `<span class="badge ${toneClass(buildTone)}">🏗️ ${buildTxt}${m.buildAgo ? ` · ${m.buildAgo}` : ''}</span>`,
    `<span class="badge ${toneClass(testTone)}">🍺 测试 ${testTxt}</span>`,
  ].join(' ');

  const footer = m.templateBehind > 0 ? `📖 模板可更新 ${m.templateBehind} 个提交 · ` : '📖 模板一致 · ';
  const covBadge = m.coverage === null ? '' : `📊 覆盖率 ${covTxt} · `;

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: ${Math.max(10, Math.min(20, fontSize))}px;
    color: var(--vscode-foreground);
    background: var(--vscode-editorWidget-background);
    margin: 0 auto; padding: 16px;
    border: 1px solid var(--vscode-widget-border, #333);
    border-radius: 12px;
    /* V5-7 (issue-4): responsive width — fill the window like a markdown doc,
       cap at a readable width and centre on very wide windows. */
    width: 100%; max-width: min(780px, calc(100vw - 32px));
  }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .head h1 { font-size: 1.25em; margin: 0; flex: 1; }
  .open-dash { font-size: .8em; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .badge { border-radius: 10px; padding: 2px 10px; font-size: .78em; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .badge.ok { background:#388a34; color:#fff; } .badge.fail { background:#a1260d; color:#fff; } .badge.warn { background:#b8954a; color:#fff; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 10px; }
  .stat { display: flex; gap: 8px; align-items: center; background: var(--vscode-editor-background); border-radius: 8px; padding: 8px 10px; }
  .stat-icon { font-size: 1.5em; }
  .stat-value { font-weight: 700; font-size: 1.05em; }
  .stat-label { opacity: .7; font-size: .72em; }
  .stat-sub { opacity: .6; font-size: .68em; }
  .ok { color:#89d185; } .warn { color:#e2c08d; } .fail { color:#f14c4c; } .plain { opacity:.85; }
  h2 { font-size: .72em; text-transform: uppercase; letter-spacing: .5px; opacity: .7; margin: 14px 0 6px; }
  .env { background: var(--vscode-editor-background); border-radius: 8px; padding: 4px 10px; }
  .env-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .dot { width: 14px; text-align:center; flex: none; }
  .env-body { flex: 1; min-width: 0; }
  .env-line { display: flex; align-items: center; gap: 8px; }
  .env-label { flex: 1; }
  .env-value { opacity: .85; font-size: .9em; }
  .env-path { opacity: .55; font-size: .72em; margin-top: 1px; word-break: break-all; }
  .provider { display:flex; align-items:center; gap:6px; margin-top:8px; font-size:.82em; }
  .acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
  button.act {
    display:flex; align-items:center; gap:6px; justify-content:flex-start;
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 6px; padding: 6px 8px; cursor: pointer; font-size: .85em;
  }
  button.act:hover { opacity: .9; }
  .key { font-size: .72em; opacity: .6; border:1px solid currentColor; border-radius: 4px; padding: 0 4px; }
  .act-icon { font-size: 1.1em; }
  button.link { background:none; border:none; color: var(--vscode-textLink-foreground); cursor:pointer; font-size:.8em; padding:0; }
  .foot { margin-top: 10px; font-size: .72em; opacity: .65; display:flex; justify-content: space-between; flex-wrap: wrap; gap:4px; }
  .prefs { margin-top: 8px; display:flex; gap: 12px; flex-wrap: wrap; }
  .hint kbd { font-family: var(--vscode-font-family); border:1px solid currentColor; border-radius:3px; padding:0 3px; }
</style>
</head>
<body>
  <div class="head">
    <h1>◇ ${esc(m.title)}</h1>
    <button class="act open-dash" data-action="het.dashboard">🏠 仪表盘</button>
  </div>
  <div class="badges">${badges}</div>
  <div class="stats">
    ${stat('❤️', '健康', health, healthTone)}
    ${stat('🏗️', '构建', buildTxt, buildTone, m.buildAgo ?? '')}
    ${stat('🍺', '测试', testTxt, testTone)}
  </div>
  <h2>环境与工具链</h2>
  <div class="env">${envRows || '<div class="env-row"><span class="env-value">未就绪</span></div>'}</div>
  ${m.provider ? `<div class="provider"><span class="dot ${toneClass(provTone)}">${provTone === 'ok' ? '✓' : provTone === 'warn' ? '!' : '✗'}</span><span>${esc(m.provider.label)}</span></div>` : ''}
  <h2>动作</h2>
  <div class="acts">${actions}</div>
  <div class="prefs">
    <button class="link" id="btn-snooze">👁 暂时隐藏监控 chip 5 分钟</button>
    <button class="link" id="btn-hide-hud">用快捷列表替代 HUD</button>
    <button class="link" id="btn-open-env">⚙️ 打开环境与工具链</button>
  </div>
  <div class="foot">
    <span class="hint">按键 <kbd>1</kbd>–<kbd>9</kbd> 直达 · <kbd>Esc</kbd> 关闭</span>
    <span>${covBadge}${footer}${esc(m.runtime ?? '')}</span>
  </div>
  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      function post(cmd) { vscode.postMessage({ type: 'command', command: cmd }); }
      document.querySelectorAll('button[data-action]').forEach((b) =>
        b.addEventListener('click', () => post(b.getAttribute('data-action'))));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { vscode.postMessage({ type: 'close' }); return; }
        if (/^[1-9]$/.test(e.key)) {
          const btn = document.querySelector('button.act .key');
          // digit → action order (1..9 are the first nine actions)
          const all = Array.from(document.querySelectorAll('button.act[data-action]'))
            .filter((b) => b.querySelector('.key'));
          const target = all[Number(e.key) - 1];
          if (target) { target.click(); }
        }
      });
      // Snooze / preferences buttons
      document.getElementById('btn-snooze').addEventListener('click', () => vscode.postMessage({ type: 'snooze' }));
      document.getElementById('btn-hide-hud').addEventListener('click', () => vscode.postMessage({ type: 'hideHud' }));
      document.getElementById('btn-open-env').addEventListener('click', () => post('het.dashboard'));
    })();
  </script>
</body>
</html>`;
}

/** Pure: value used by the host to disable the HUD (falls back to QuickPick). */
export function hudEnabled(cfgValue: unknown): boolean {
  return cfgValue !== true;
}
