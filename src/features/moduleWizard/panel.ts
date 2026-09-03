import * as vscode from 'vscode';
import { ModuleLanguage, ModulePlan } from '../../core/moduleTemplate';
import { esc, pageShell } from '../ui';

/** Wizard form values collected from the webview. */
export interface ModulePanelInput {
  moduleName: string;
  description: string;
  language: ModuleLanguage;
  since: string;
  extraDeclarations?: string;
}

export interface ModuleWizardDeps {
  /** Live preview: returns plan plus conflict warnings per file. */
  plan: (input: ModulePanelInput) => Promise<{ plan: ModulePlan; conflicts: string[] }>;
  /** Confirm + write files, then refresh host state. */
  create: (input: ModulePanelInput) => Promise<{ ok: boolean; message: string }>;
}

export function showModuleWizardPanel(context: vscode.ExtensionContext, deps: ModuleWizardDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.moduleWizard',
    'HeT DevTools — 新增模块向导',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  let previewHtml = '';
  const render = async (): Promise<void> => {
    panel.webview.html = pageShell(
      '新增模块向导',
      `<div class="sub">生成 fcpp 成对文件骨架（include/ + src/），随后可一键构建。</div>${buildFormHtml(previewHtml)}`,
    );
  };

  panel.webview.onDidReceiveMessage(async (message: { type: string; input?: ModulePanelInput }) => {
    const input = message.input;
    if (!input) {
      return;
    }
    if (message.type === 'plan') {
      const { plan, conflicts } = await deps.plan(input);
      previewHtml = plan.ok ? buildPreviewHtml(plan, conflicts) : buildIssueHtml(plan.issues);
      await render();
    } else if (message.type === 'create') {
      const result = await deps.create(input);
      void vscode.window.showInformationMessage(result.message);
      if (result.ok) {
        previewHtml = '';
        await render();
      }
    }
  });

  void render().catch((e) => console.error('[het] module wizard render failed', e));
  return panel;
}

function buildFormHtml(previewHtml: string): string {
  const input = (name: string, label: string, value: string, hint = '') => `
    <label class="fld">${label}${hint ? `<span class="hint">${hint}</span>` : ''}
      <input data-field="${name}" value="${esc(value)}" />
    </label>`;
  return `
    <style>
      .fld { display: block; margin: 8px 0 12px; font-size: 12px; opacity: .95; }
      .fld .hint { display: block; font-size: 11px; opacity: .6; margin-top: 2px; }
      input, select, textarea {
        width: 100%; margin-top: 4px; padding: 6px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, #555);
        border-radius: 4px;
        font-family: var(--vscode-font-family);
      }
      textarea { font-family: var(--vscode-editor-font-family); }
      .file { margin: 6px 0 14px; }
      .fname { font-weight: 600; font-size: 12px; margin-bottom: 4px; }
      pre {
        background: var(--vscode-textCodeBlock-background, #111);
        padding: 10px; border-radius: 6px; overflow-x: auto;
        font-size: 11px; line-height: 1.5;
      }
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
    </style>
    <div class="card">
      ${input('moduleName', '模块名（小写标识符）', 'mymod', '如 mymod；将生成 include/mymod.hpp + src/mymod.cpp')}
      ${input('description', '一句话说明（写入双语注释）', '', '英文会用于 @brief [en]，中文用于 @brief [zh]')}
      <label class="fld">语言
        <select data-field="language">
          <option value="cpp">C++（.hpp / .cpp）</option>
          <option value="c">C（.h / .c）</option>
        </select>
      </label>
      ${input('since', '起始版本 @since', '1.0')}
      <label class="fld">额外公开声明（可选，逐行粘贴函数/宏声明，将置于 Export 注释块内）
        <textarea data-field="extraDeclarations" rows="5" placeholder="int mymod_sum(const int* a, int n);"></textarea>
      </label>
      <div class="row">
        <button data-action="plan">生成预览</button>
        <button data-action="create" class="primary">创建文件</button>
      </div>
    </div>
    <div id="preview">${previewHtml}</div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        const $ = (s) => document.querySelector(s);
        const collect = () => {
          const f = (name) => (document.querySelector('[data-field="' + name + '"]') || {}).value || '';
          return {
            moduleName: f('moduleName').trim(),
            description: f('description').trim(),
            language: f('language'),
            since: f('since').trim(),
            extraDeclarations: f('extraDeclarations'),
          };
        };
        document.querySelector('[data-action="plan"]').addEventListener('click', () => vscode.postMessage({ type: 'plan', input: collect() }));
        document.querySelector('[data-action="create"]').addEventListener('click', () => vscode.postMessage({ type: 'create', input: collect() }));
      })();
    </script>`;
}

function buildPreviewHtml(plan: ModulePlan, conflicts: string[]): string {
  const warn = conflicts.length
    ? `<div class="warn">⚠ 以下文件已存在，创建将覆盖：<br/>${conflicts.map((c) => esc(c)).join('<br/>')}</div>`
    : '';
  const files = plan.files
    .map(
      (f) => `
      <div class="file">
        <div class="fname">${esc(f.relPath)}</div>
        <pre>${esc(f.content)}</pre>
      </div>`,
    )
    .join('');
  return `${warn}<h2>预览</h2>${files}`;
}

function buildIssueHtml(issues: string[]): string {
  return `<h2>无法生成</h2><div class="warn">${issues.map((i) => esc(i)).join('<br/>')}</div>`;
}
