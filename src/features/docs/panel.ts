import * as vscode from 'vscode';
import { esc, pageShell } from '../ui';

export interface DocToolStatus {
  name: string;
  ok: boolean;
  note?: string;
}

export interface DocArtifact {
  rel: string;
  abs: string;
}

export interface DocsState {
  projectName: string;
  languages: string[];
  versions: string[];
  tools: DocToolStatus[];
  graphvizMismatch: boolean;
  graphvizCurrent: string;
  graphvizExpected: string;
  artifacts: DocArtifact[];
}

export interface DocsDeps {
  getState: () => Promise<DocsState>;
  runDocs: () => Promise<{ ok: boolean; message: string }>;
  fixGraphviz: () => Promise<{ ok: boolean; message: string }>;
  openArtifact: (rel: string) => Promise<void>;
}

export function showDocsPanel(context: vscode.ExtensionContext, deps: DocsDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.docs',
    'HeT DevTools — 文档中心',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (): Promise<void> => {
    const state = await deps.getState();
    panel.webview.html = buildHtml(state);
  };

  panel.webview.onDidReceiveMessage(async (message: { type: string; rel?: string }) => {
    if (message.type === 'refresh') {
      await render();
    } else if (message.type === 'runDocs') {
      const r = await deps.runDocs();
      void vscode.window.showInformationMessage(r.message);
      await render();
    } else if (message.type === 'fixGraphviz') {
      const r = await deps.fixGraphviz();
      void vscode.window.showInformationMessage(r.message);
      await render();
    } else if (message.type === 'openArtifact' && message.rel) {
      await deps.openArtifact(message.rel);
    }
  });

  void render().catch((e) => console.error('[het] docs render failed', e));
  return panel;
}

function buildHtml(state: DocsState): string {
  const noProject = state.projectName.length === 0;
  const toolChips = state.tools
    .map((t) => `<span class="chip ${t.ok ? 'ok' : 'fail'}">${esc(t.name)} ${t.ok ? '✓' : '✗'}</span>`)
    .join(' ');

  const graphviz = state.graphvizMismatch
    ? `<div class="warn">⚠ Graphviz 路径与当前系统不匹配（配置为 <code>${esc(state.graphvizCurrent)}</code>，本机为 <code>${esc(state.graphvizExpected)}</code>）。机器相关值提交前请还原。
        <br/><button data-action="fixGraphviz">🔧 本机修正</button></div>`
    : '';

  const missing = state.tools.filter((t) => !t.ok);
  const missingBanner =
    missing.length > 0
      ? `<div class="warn">缺少工具：${missing.map((t) => `${esc(t.name)} ✗`).join(' ')}
          <div class="tag">文档功能仅在使用时才需要。安装指引（复制到终端）：
          <pre># Windows (conda-forge build 环境示例)
conda install -n build -c conda-forge doxygen graphviz sphinx sphinx-intl sphinx_rtd_theme make python
# Linux
sudo apt install doxygen graphviz make python3-sphinx</pre></div></div>`
      : '';

  const chips =
    state.languages.length === 0 && state.versions.length === 0
      ? '<div class="tag">metadata.json 未配置 doc_languages / doc_versions（默认 en/zh、1.0）。</div>'
      : `<div class="row">
           <span class="tag">语言：</span>${state.languages.map((l) => `<span class="chip">${esc(l)}</span>`).join(' ')}
           <span class="tag" style="margin-left:14px">版本：</span>${state.versions.map((v) => `<span class="chip">${esc(v)}</span>`).join(' ')}
         </div>`;

  const artifacts =
    state.artifacts.length === 0
      ? '<div class="tag">尚未找到文档产物。点击「一键生成文档」。</div>'
      : state.artifacts
          .map(
            (a) =>
              `<div class="row"><span class="fname">📄 ${esc(a.rel)}</span>
               <button data-action="openArtifact" data-rel="${esc(a.rel)}">在浏览器打开</button></div>`,
          )
          .join('');

  return pageShell(
    '文档中心',
    `
    <style>
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px;
        padding: 8px 10px; margin: 8px 0; font-size: 12px; }
      .tag { font-size: 11px; opacity: .75; }
      .fname { flex: 1; font-size: 12px; }
      pre { background: var(--vscode-textCodeBlock-background,#111); padding: 8px; border-radius: 6px; font-size: 11px; }
      code { background: var(--vscode-textCodeBlock-background,#111); padding: 1px 5px; border-radius: 4px; }
    </style>
    <div class="card">
      <h1>文档中心</h1>
      <div class="sub">项目：${esc(state.projectName || '—')} · 一键生成 Doxygen + Sphinx 双语多版本文档</div>
      ${noProject ? '<div class="warn">未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。</div>' : ''}
      ${graphviz}
      ${missingBanner}
      <h2>语言与版本（来自 metadata.json）</h2>
      ${chips}
      <h2>工具</h2>
      <div class="row">${toolChips}</div>
      <div class="row">
        <button data-action="runDocs">📖 一键生成文档</button>
        <button data-action="refresh" class="secondary">🔄 刷新</button>
      </div>
      <h2>产物</h2>
      ${artifacts}
    </div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('button[data-action]').forEach((b) =>
          b.addEventListener('click', () => {
            const act = b.getAttribute('data-action');
            if (act === 'openArtifact') {
              vscode.postMessage({ type: 'openArtifact', rel: b.getAttribute('data-rel') });
            } else {
              vscode.postMessage({ type: act });
            }
          }));
      })();
    </script>
    `,
  );
}
