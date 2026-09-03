import * as vscode from 'vscode';
import { esc, pageShell } from '../ui';
import { QualityIssue } from '../../core/qualityGates';

export type GateRowStatus = 'pass' | 'fail' | 'na' | 'idle';

export interface QualityRow {
  id: string;
  label: string;
  status: GateRowStatus;
  tool: string;
  detail?: string;
}

export interface QualityRunResult {
  rowId: string;
  status: GateRowStatus;
  summary: string;
  issues: QualityIssue[];
  errors: string[];
}

export interface QualityDeps {
  getRows: () => Promise<QualityRow[]>;
  runRow: (rowId: string) => Promise<QualityRunResult>;
  fixFormat: () => Promise<{ ok: boolean; message: string }>;
  openIssue: (file: string, line?: number) => void;
}

export function showQualityPanel(context: vscode.ExtensionContext, deps: QualityDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.quality',
    'HeT DevTools — 质量与安全',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (detailHtml = ''): Promise<void> => {
    const rows = await deps.getRows();
    panel.webview.html = buildHtml(rows, detailHtml);
  };

  panel.webview.onDidReceiveMessage(async (message: { type: string; rowId?: string; file?: string; line?: number }) => {
    if (message.type === 'refresh') {
      await render();
    } else if (message.type === 'runRow' && message.rowId) {
      const result = await deps.runRow(message.rowId);
      await render(buildResultHtml(result));
    } else if (message.type === 'fixFormat') {
      const r = await deps.fixFormat();
      void vscode.window.showInformationMessage(r.message);
      await render('');
    } else if (message.type === 'openIssue' && message.file) {
      deps.openIssue(message.file, message.line);
    }
  });

  void render().catch((e) => console.error('[het] quality render failed', e));
  return panel;
}

const STATUS_ICON: Record<GateRowStatus, string> = {
  pass: '✓',
  fail: '✗',
  na: '–',
  idle: '·',
};

function buildRowsHtml(rows: QualityRow[]): string {
  return rows
    .map(
      (r) => `<div class="row gate">
        <span class="chip ${r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'fail' : ''}">${STATUS_ICON[r.status]} ${esc(r.label)}</span>
        <span class="tag">${esc(r.tool)}</span>
        <span class="title" style="flex:1"></span>
        <button data-action="runRow" data-row="${esc(r.id)}">${r.status === 'pass' ? '复查' : '检查'}</button>
      </div>${r.detail ? `<div class="detail">${esc(r.detail)}</div>` : ''}`,
    )
    .join('');
}

function buildResultHtml(result: QualityRunResult): string {
  const badge =
    result.status === 'pass'
      ? '<span class="chip ok">✓ 通过</span>'
      : result.status === 'fail'
        ? '<span class="chip fail">✗ 失败</span>'
        : '<span class="chip">– 不可用</span>';
  const issues =
    result.issues.length === 0
      ? ''
      : `<div class="issue-list">${result.issues
          .map(
            (i) =>
              `<div class="issue" data-file="${esc(i.file)}" data-line="${i.line ?? ''}" title="点击打开">
                 <span class="tag">${esc(i.file)}${i.line ? `:${i.line}` : ''}</span>
                 <span>${esc(i.message)}</span>
               </div>`,
          )
          .join('')}</div>`;
  const errors = result.errors.map((e) => `<div class="warn">${esc(e)}</div>`).join('');
  const fixBtn = result.rowId === 'format' && result.status === 'fail' ? '<button data-action="fixFormat">🧹 自动修复格式</button>' : '';
  return `
    <h2>结果：${esc(result.summary)} ${badge}</h2>
    ${errors}
    ${issues}
    ${fixBtn}
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.issue').forEach((el) =>
          el.addEventListener('click', () =>
            vscode.postMessage({ type: 'openIssue', file: el.getAttribute('data-file'), line: Number(el.getAttribute('data-line') || 0) || undefined })));
        document.querySelector('[data-action="fixFormat"]')?.addEventListener('click', () =>
          vscode.postMessage({ type: 'fixFormat' }));
      })();
    </script>`;
}

function buildHtml(rows: QualityRow[], detailHtml: string): string {
  return pageShell(
    '质量与安全',
    `
    <style>
      .gate { border-bottom: 1px solid var(--vscode-widget-border,#333); padding: 6px 0; }
      .issue-list { margin: 6px 0; }
      .issue { display: flex; gap: 10px; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
      .issue:hover { background: var(--vscode-list-hoverBackground); }
      .warn { background: rgba(226,192,141,.12); border: 1px solid #e2c08d; border-radius: 6px; padding: 6px 8px; margin: 4px 0; font-size: 12px; white-space: pre-wrap; }
    </style>
    <div class="card">
      <h1>质量与安全</h1>
      <div class="sub">本地门禁与 CI 一致（clang-format / clang-tidy / schema / commitlint）。本地绿 = 推送后 CI 绿。</div>
      ${buildRowsHtml(rows)}
      <div class="row"><button data-action="refresh" class="secondary">🔄 刷新状态</button></div>
    </div>
    <div id="detail">${detailHtml}</div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('button[data-action]').forEach((b) =>
          b.addEventListener('click', () => {
            const act = b.getAttribute('data-action');
            const row = b.getAttribute('data-row');
            if (row) { vscode.postMessage({ type: 'runRow', rowId: row }); }
            else { vscode.postMessage({ type: act }); }
          }));
      })();
    </script>
    `,
  );
}
