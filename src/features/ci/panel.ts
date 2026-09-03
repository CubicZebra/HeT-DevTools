import * as vscode from 'vscode';
import { esc, pageShell } from '../ui';
import { LocalWorkflow } from '../../core/ciStatus';

export interface CiRunInfo {
  name: string;
  branch: string;
  status: string;
  conclusion: string;
  createdAt: string;
  url: string;
}

export interface CiState {
  repoLabel: string;
  tier: 'vscode' | 'gh' | 'anonymous' | 'offline';
  tierLabel: string;
  hint: string;
  workflows: LocalWorkflow[];
  runs: CiRunInfo[];
  online: boolean;
  actionsUrl: string;
}

export interface CiDeps {
  getState: () => Promise<CiState>;
  openActions: () => Promise<void>;
}

export function showCiPanel(context: vscode.ExtensionContext, deps: CiDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.ci',
    'HeT DevTools — CI 状态',
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
    } else if (message.type === 'openActions') {
      await deps.openActions();
    }
  });

  void render().catch((e) => console.error('[het] ci render failed', e));
  return panel;
}

function buildHtml(s: CiState): string {
  const tierClass = s.tier === 'anonymous' || s.tier === 'offline' ? 'chip' : 'chip ok';
  const wf = s.workflows
    .map((w) => `<div class="row"><span class="chip">${esc(w.name)}</span><span class="tag">${esc(w.on.join(' / '))}</span><span class="fname">${esc(w.file)}</span></div>`)
    .join('');
  const runs =
    s.runs.length === 0
      ? '<div class="tag">暂无远端运行数据。</div>'
      : s.runs
          .map(
            (r) =>
              `<div class="row"><span class="chip ${r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'fail' : ''}">${esc(r.conclusion || r.status)}</span><span class="fname">${esc(r.name)} · ${esc(r.branch)}</span><span class="tag">${esc(r.createdAt)}</span></div>`,
          )
          .join('');
  const offlineNote = s.online
    ? ''
    : `<div class="warn">当前无法访问 GitHub（离线或无网络代理）。CI 状态仅展示本地工作流清单；恢复网络或登录后点「🔄 刷新」拉取运行状态（能力见 D-9 矩阵：匿名=公开仓库只读）。</div>`;
  return pageShell(
    'CI 状态',
    `
    <style>
      .fname { flex:1; font-size:12px; }
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px;
        padding: 8px 10px; margin: 6px 0; font-size: 12px; }
    </style>
    <div class="card">
      <h1>CI 状态</h1>
      <div class="sub">仓库：${esc(s.repoLabel || '—')} <span class="${tierClass}">${esc(s.tierLabel)}</span></div>
      <div class="tag">${esc(s.hint)}</div>
      ${offlineNote}
      <div class="row">
        <button data-action="refresh">🔄 刷新</button>
        <button data-action="openActions" ${s.actionsUrl ? '' : 'disabled'}>在 GitHub 打开 Actions</button>
      </div>
      <h2>运行状态（最近）</h2>
      ${runs}
      <h2>本地工作流（.github/workflows）</h2>
      ${wf || '<div class="tag">无 .github/workflows（非模板项目或未同步）。</div>'}
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
