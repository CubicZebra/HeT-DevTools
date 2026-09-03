import * as vscode from 'vscode';
import { esc, pageShell } from '../ui';

export interface PreflightItem {
  label: string;
  ok: boolean | undefined; // undefined = 未运行/不可判定
  detail?: string;
  required: boolean;
}

export interface PreflightState {
  projectName: string;
  items: PreflightItem[];
  passed: number;
  total: number;
  allowRelease: boolean;
}

export interface PreflightDeps {
  getState: () => Promise<PreflightState>;
  runTests: () => Promise<{ ok: boolean; message: string }>;
  openQuality: () => Promise<void>;
  openRelease: () => Promise<void>;
}

export function showPreflightPanel(context: vscode.ExtensionContext, deps: PreflightDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.preflight',
    'HeT DevTools — 发布前检查',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (): Promise<void> => {
    const state = await deps.getState();
    panel.webview.html = buildHtml(state);
  };

  panel.webview.onDidReceiveMessage(async (message: { type: string }) => {
    if (message.type === 'refresh') {
      await render();
    } else if (message.type === 'runTests') {
      const r = await deps.runTests();
      void vscode.window.showInformationMessage(r.message);
      await render();
    } else if (message.type === 'openQuality') {
      await deps.openQuality();
    } else if (message.type === 'openRelease') {
      await deps.openRelease();
    }
  });

  void render().catch((e) => console.error('[het] preflight render failed', e));
  return panel;
}

function buildHtml(s: PreflightState): string {
  const rows = s.items
    .map((it) => {
      const mark =
        it.ok === true
          ? '<span class="chip ok">✓</span>'
          : it.ok === false
            ? '<span class="chip fail">✗</span>'
            : '<span class="chip">·</span>';
      return `<div class="row item">
        ${mark}<span class="title">${esc(it.label)}</span>
        ${it.required ? '' : '<span class="tag">建议项</span>'}
        ${it.detail ? `<div class="detail">${esc(it.detail)}</div>` : ''}
      </div>`;
    })
    .join('');
  return pageShell(
    '发布前检查',
    `
    <style>
      .item { border-bottom: 1px solid var(--vscode-widget-border,#333); padding: 4px 0; flex-wrap: wrap; }
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px;
        padding: 8px 10px; margin: 6px 0; font-size: 12px; }
    </style>
    <div class="card">
      <h1>发布前检查（Preflight）</h1>
      <div class="sub">项目：${esc(s.projectName || '—')} · 与 CI 门禁一致：本地绿 = 推送后绿</div>
      <div id="items">${rows || '<div class="warn">未检测到 fcpp 项目。</div>'}</div>
      <div class="row">
        <button data-action="refresh">🔄 重新检查</button>
        <button data-action="runTests" class="secondary">▶ 运行构建并测试</button>
        <button data-action="openQuality" class="secondary">质量门禁</button>
      </div>
      <h2>结果</h2>
      ${s.passed}/${s.total} 通过 · 允许发布：${s.allowRelease ? '是' : '否'}
      <div class="row"><button data-action="openRelease" ${s.allowRelease ? '' : 'disabled'} class="primary">🚀 去发布中心</button></div>
    </div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('button[data-action]').forEach((b) =>
          b.addEventListener('click', () => vscode.postMessage({ type: b.getAttribute('data-action') })));
      })();
    </script>
    `,
  );
}
