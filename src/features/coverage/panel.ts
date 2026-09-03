import * as vscode from 'vscode';
import { esc } from '../ui';

export interface CoverageState {
  /** Current project name ('' when none). */
  projectName: string;
  /** metadata.json activate_code_coverage flag. */
  enabled: boolean;
  /** Absolute path of a located coverage_report/index.html ('' when none). */
  reportPath: string;
}

export interface CoverageDeps {
  getState: () => Promise<CoverageState>;
  /** Persist activate_code_coverage, then refresh. */
  toggle: (enabled: boolean) => Promise<{ ok: boolean; message: string }>;
  /** Run the coverage build+test then report the located report path. */
  runCoverage: () => Promise<{ ok: boolean; message: string }>;
}

export function showCoveragePanel(context: vscode.ExtensionContext, deps: CoverageDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.coverage',
    'HeT DevTools — 覆盖率',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (): Promise<void> => {
    const state = await deps.getState();
    panel.webview.html = buildHtml(state);
  };

  panel.webview.onDidReceiveMessage(async (message: { type: string; enabled?: boolean }) => {
    if (message.type === 'toggle' && typeof message.enabled === 'boolean') {
      const r = await deps.toggle(message.enabled);
      void vscode.window.showInformationMessage(r.message);
      await render();
    } else if (message.type === 'runCoverage') {
      const r = await deps.runCoverage();
      void vscode.window.showInformationMessage(r.message);
      await render();
    } else if (message.type === 'openReport') {
      const state = await deps.getState();
      if (state.reportPath) {
        void vscode.env.openExternal(vscode.Uri.file(state.reportPath));
      }
    }
  });

  void render().catch((e) => console.error('[het] coverage render failed', e));
  return panel;
}

function buildHtml(state: CoverageState): string {
  const noProject = state.projectName.length === 0;
  const banner = noProject
    ? `<div class="warn">未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。</div>`
    : !state.enabled
      ? `<div class="warn">覆盖率开关未开启（metadata.json 的 activate_code_coverage=false）。开启后“构建并测覆盖率”会使用 g++/gcov 工具链（Linux CI 同源），MSVC 环境请改用 WSL/CI 生成。</div>`
      : `<div class="ok-note">activate_code_coverage=true — 覆盖率构建已启用。</div>`;

  const toggleBtn = noProject
    ? ''
    : `<button data-action="toggle" data-value="${state.enabled ? 'false' : 'true'}">${state.enabled ? '关闭 activate_code_coverage' : '一键开启 activate_code_coverage'}</button>`;

  const report = state.reportPath
    ? `<div class="ok-note">报告就绪：<code>${esc(state.reportPath)}</code></div>
       <button data-action="openReport">在浏览器打开报告</button>`
    : `<div class="tag">尚未找到 coverage_report/index.html。点击下方按钮构建并测量覆盖率。</div>`;

  return `
    <style>
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px;
        padding: 8px 10px; margin: 8px 0; font-size: 12px; }
      .ok-note { color: #89d185; font-size: 12px; margin: 8px 0; }
      .tag { font-size: 12px; opacity: .75; margin: 8px 0; }
      code { background: var(--vscode-textCodeBlock-background,#111); padding: 1px 5px; border-radius: 4px; }
    </style>
    <div class="card">
      <h1>覆盖率</h1>
      <div class="sub">项目：${esc(state.projectName || '—')}</div>
      ${banner}
      <div class="row">${toggleBtn}
        <button data-action="runCoverage">🔄 构建并测覆盖率</button>
      </div>
      ${report}
    </div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('[data-action]').forEach((b) =>
          b.addEventListener('click', () => {
            const act = b.getAttribute('data-action');
            if (act === 'toggle') {
              vscode.postMessage({ type: 'toggle', enabled: b.getAttribute('data-value') === 'true' });
            } else {
              vscode.postMessage({ type: act });
            }
          }));
      })();
    </script>`;
}
