import * as vscode from 'vscode';
import { esc } from '../ui';

export interface DiscoveredModule {
  name: string;
  header: string;
  apiCount: number;
}

export interface TestgenDeps {
  listModules: () => Promise<DiscoveredModule[]>;
  /** Render preview for one module. */
  preview: (moduleName: string) => Promise<{ ok: boolean; issues: string[]; relPath: string; content: string }>;
  /** Confirm + write the generated test file (add-only). */
  create: (moduleName: string) => Promise<{ ok: boolean; message: string }>;
}

export function showTestgenPanel(context: vscode.ExtensionContext, deps: TestgenDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.testgen',
    'HeT DevTools — 生成测试（模式 A）',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (selected = ''): Promise<void> => {
    const modules = await deps.listModules();
    panel.webview.html = buildHtml(modules, selected);
  };

  panel.webview.onDidReceiveMessage(async (message: { type: string; moduleName?: string }) => {
    if (message.type === 'preview' && message.moduleName) {
      const p = await deps.preview(message.moduleName);
      panel.webview.postMessage({
        type: 'previewResult',
        moduleName: message.moduleName,
        ok: p.ok,
        issues: p.issues,
        relPath: p.relPath,
        content: p.content,
      });
    } else if (message.type === 'create' && message.moduleName) {
      const r = await deps.create(message.moduleName);
      void vscode.window.showInformationMessage(r.message);
    }
  });

  void render().catch((e) => console.error('[het] testgen render failed', e));
  return panel;
}

function buildHtml(modules: DiscoveredModule[], selected: string): string {
  const options = modules
    .map(
      (m) =>
        `<option value="${esc(m.name)}" ${m.name === selected ? 'selected' : ''}>${esc(m.name)} — ${m.header}（公开 API ${m.apiCount} 个）</option>`,
    )
    .join('');

  const hint =
    modules.length === 0
      ? `<div class="warn">include/ 下未发现带 @exporter 公开 API 的头文件。可先用「新增模块」向导创建模块。</div>`
      : '';

  return `
    <style>
      .fld { display: block; margin: 8px 0 12px; font-size: 12px; }
      select, textarea { width: 100%; margin-top: 4px; padding: 6px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, #555); border-radius: 4px; }
      pre { background: var(--vscode-textCodeBlock-background,#111); padding: 10px;
        border-radius: 6px; overflow-x: auto; font-size: 11px; line-height: 1.5; }
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px;
        padding: 8px 10px; margin: 8px 0; font-size: 12px; }
      .ok-note { color:#89d185; font-size: 12px; }
    </style>
    <div class="card">
      <div class="fld">选择模块（按 include/ 自动发现，扫描 @exporter 公开 API）
        <select id="mod">${options}</select>
      </div>
      <div class="fld">生成策略：正向 + 边界 + 负向（默认，每个公开 API）</div>
      <div class="fld">输出位置：test_package/test/unit/&lt;module&gt;_test.cpp（main.cpp 由系统维护，不手改）</div>
      ${hint}
      <div class="row">
        <button id="previewBtn">预览生成的文件</button>
        <button id="createBtn" class="primary">创建测试文件</button>
      </div>
    </div>
    <div id="out"></div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        const $ = (s) => document.querySelector(s);
        const mod = () => $('#mod').value;
        const show = (html) => { $('#out').innerHTML = html; };
        $('#previewBtn').addEventListener('click', () => vscode.postMessage({ type: 'preview', moduleName: mod() }));
        $('#createBtn').addEventListener('click', () => vscode.postMessage({ type: 'create', moduleName: mod() }));
        window.addEventListener('message', (e) => {
          const m = e.data;
          if (m.type === 'previewResult') {
            if (!m.ok) { show('<div class="warn">' + m.issues.map(escHtml).join('<br/>') + '</div>'); return; }
            show('<h2>预览：' + escHtml(m.relPath) + '</h2><pre>' + escHtml(m.content) + '</pre>' +
              '<div class="ok-note">仅新增文件，不改 include/ 与 src/。确认后点击「创建测试文件」。</div>');
          }
        });
        function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      })();
    </script>`;
}
