import * as vscode from 'vscode';
import { DependencyView } from '../../core/dependencyService';
import { esc, pageShell } from '../ui';

export interface DepAddInput {
  conanName: string;
  version: string;
  bucket: 'common' | 'c' | 'cpp' | 'infra';
  targets?: string;
}

export interface DepPanelState {
  views: DependencyView[];
  issues: string[];
}

export interface DepPanelDeps {
  getState: () => Promise<DepPanelState>;
  add: (input: DepAddInput) => Promise<{ ok: boolean; message: string }>;
  remove: (bucket: string, displayKey: string) => Promise<{ ok: boolean; message: string }>;
  refresh: () => Promise<void>;
}

const BUCKET_LABEL: Record<string, string> = {
  common: 'C/C++ 共用 (common)',
  c: '仅 C (c)',
  cpp: '仅 C++ (cpp)',
  infra: '基础设施 (infra)',
};

export function showDepsPanel(context: vscode.ExtensionContext, deps: DepPanelDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.deps',
    'HeT DevTools — 依赖管理器',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (): Promise<void> => {
    const state = await deps.getState();
    panel.webview.html = buildHtml(state);
  };

  panel.webview.onDidReceiveMessage(
    async (message: {
      type: string;
      input?: DepAddInput;
      bucket?: string;
      displayKey?: string;
    }) => {
      if (message.type === 'refresh') {
        await render();
      } else if (message.type === 'add' && message.input) {
        const result = await deps.add(message.input);
        void vscode.window.showInformationMessage(result.message);
        await render();
      } else if (message.type === 'remove' && message.bucket && message.displayKey) {
        const result = await deps.remove(message.bucket, message.displayKey);
        void vscode.window.showInformationMessage(result.message);
        await render();
      }
    },
  );

  void render().catch((e) => console.error('[het] deps render failed', e));
  return panel;
}

function buildHtml(state: DepPanelState): string {
  const grouped = new Map<string, DependencyView[]>();
  for (const v of state.views) {
    const list = grouped.get(v.bucket) ?? [];
    list.push(v);
    grouped.set(v.bucket, list);
  }

  const bucketHtml = Object.entries(BUCKET_LABEL)
    .map(([bucket, label]) => {
      const items = (grouped.get(bucket) ?? []).map(
        (v) => `
        <div class="row">
          <span class="chip">${esc(v.displayKey)}</span>
          <span class="tag">${esc(v.version ?? '版本未知')}</span>
          <span class="title" style="text-align:left">${esc(v.targets.join(', '))}</span>
          <button class="secondary" onclick="remove('${esc(bucket)}','${esc(v.displayKey)}')">移除</button>
        </div>`,
      ).join('');
      return `<h2>${esc(label)} <span class="tag">${grouped.get(bucket)?.length ?? 0}</span></h2>
        <div class="card">${items || '<span class="tag">（空）</span>'}</div>`;
    })
    .join('');

  const issuesHtml = state.issues
    .map((i) => `<div class="fail">⚠ ${esc(i)}</div>`)
    .join('');

  return pageShell(
    'HeT DevTools — 依赖管理器',
    `<h1>依赖管理器</h1>
     <div class="sub">依赖会同时写入 conandata.yml 与 metadata.json（预览确认后生效）。</div>
     ${issuesHtml}
     ${bucketHtml}
     <h2>添加依赖</h2>
     <div class="card">
       <div class="row">
         <input id="pkg" placeholder="包名（如 fmt / zlib / eigen）" style="flex:2"/>
         <input id="ver" placeholder="版本（如 11.1.4）" style="flex:1"/>
       </div>
       <div class="row">
         <span>归属桶</span>
         <select id="bucket">
           <option value="cpp">仅 C++ (cpp)</option>
           <option value="common">C/C++ 共用 (common)</option>
           <option value="c">仅 C (c)</option>
           <option value="infra">基础设施 (infra)</option>
         </select>
         <input id="targets" placeholder="CMake target（可空，如 fmt::fmt）" style="flex:1"/>
       </div>
       <div class="sub">规则：一个包只能归一个桶；GTest 自动归 infra；pybind11 需先开启 Python 绑定。</div>
       <button onclick="add()">＋ 添加（预览并确认）</button>
       <button class="secondary" onclick="refresh()">↻ 刷新</button>
     </div>
     <script>
       const vscode = acquireVsCodeApi();
       function refresh() { vscode.postMessage({ type: 'refresh' }); }
       function add() {
         const conanName = document.getElementById('pkg').value.trim();
         const version = document.getElementById('ver').value.trim();
         const bucket = document.getElementById('bucket').value;
         const targets = document.getElementById('targets').value.trim();
         if (!conanName || !version) { return; }
         vscode.postMessage({ type: 'add', input: { conanName, version, bucket, targets } });
       }
       function remove(bucket, displayKey) {
         vscode.postMessage({ type: 'remove', bucket, displayKey });
       }
     </script>`,
  );
}
