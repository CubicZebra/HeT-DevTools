import * as vscode from 'vscode';
import { HealthReport } from '../../core/healthCheck';
import { DashboardSnapshot, esc, pageShell } from '../ui';

/** icon + style for a check item kind */
function kindMark(kind: HealthReport['checks'][number]['kind']): string {
  if (kind === 'ok') {
    return '<span class="ok">✔</span>';
  }
  return kind === 'warn' ? '<span class="warn">⚠</span>' : '<span class="fail">✖</span>';
}

function verdictClass(verdict: string): string {
  return verdict === 'PASS' ? 'ok' : verdict === 'WARN' ? 'warn' : 'fail';
}

export interface DashboardPanelDeps {
  getSnapshot: () => Promise<DashboardSnapshot>;
  runCommand: (command: string) => void;
}

export function showDashboardPanel(context: vscode.ExtensionContext, deps: DashboardPanelDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.dashboard',
    'HeT DevTools 驾驶舱',
    vscode.ViewColumn.One,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (): Promise<void> => {
    const snapshot = await deps.getSnapshot();
    panel.webview.html = buildDashboardHtml(snapshot);
  };

  panel.webview.onDidReceiveMessage((message: { type: string; command?: string }) => {
    if (message.type === 'refresh') {
      void render();
    } else if (message.type === 'command' && message.command) {
      deps.runCommand(message.command);
    }
  });

  void render().catch((e) => console.error('[het] dashboard render failed', e));
  return panel;
}

function buildDashboardHtml(snapshot: DashboardSnapshot): string {
  const project = snapshot.project;
  const health = snapshot.health;
  const m = project?.metadata;

  let scoreCard = '';
  if (health) {
    const rows = health.checks
      .map(
        (c) => `
        <div class="row">
          ${kindMark(c.kind)}
          <span class="title">${esc(c.title)}</span>
          <span class="tag">${c.weight}pt</span>
        </div>
        <div class="detail">${esc(c.detail)}${c.suggestion ? ` — ${esc(c.suggestion)}` : ''}</div>`,
      )
      .join('');
    scoreCard = `
    <h2>健康评分</h2>
    <div class="card">
      <div class="row"><span class="score-big ${verdictClass(health.verdict)}">${health.score}</span>
        <span style="margin-left:8px"><b class="${verdictClass(health.verdict)}">${health.verdict}</b>
        <div class="tag">满分 100 · 绿色 ≥ 80 · 黄色 ≥ 50</div></span>
        <span style="margin-left:auto"><button onclick="refresh()">重新体检</button></span>
      </div>
      ${rows}
    </div>`;
  }

  const toolChips = Object.values(snapshot.tools)
    .map((t) => `<span class="chip ${t.state === 'ok' ? 'ok' : 'fail'}">${esc(t.name)} ${t.version ? esc(t.version.split('\n')[0].slice(0, 24)) : t.state === 'missing' ? '未安装' : ''}</span>`)
    .join('');

  const switches = m?.workflow_triggers
    ? Object.entries(m.workflow_triggers)
        .map(([k, v]) => `<span class="switch-row"><span>${v ? '✔' : '·'}</span> ${esc(k)}</span>`)
        .join('')
    : '<span class="tag">未配置 workflow_triggers</span>';

  const projectCard = m
    ? `
    <h2>项目</h2>
    <div class="card">
      <h1>${esc(m.name)} <span class="tag">v${esc(m.version ?? '0.0.0')}</span></h1>
      <div class="sub">${esc(m.description ?? '')}</div>
      <div class="row"><span class="chip">${esc(m.license ?? '')}</span>
      <span class="chip">C++${esc(m.build_cppstd ?? '17')}</span>
      <span class="chip">C${esc(m.build_cstd ?? '11')}</span>
      <span class="chip">${esc(m.build_type ?? 'Debug')}</span>
      ${m.is_header ? '<span class="chip">纯头文件</span>' : ''}
      ${m.is_shared ? '<span class="chip">共享库</span>' : ''}
      ${m.generate_modules_inplace ? '<span class="chip">C++23 模块</span>' : ''}</div>
      <div class="sub">${esc(project?.root ?? '')}</div>
      <button onclick="post('het.build')">▶ 构建项目</button>
      <button class="secondary" onclick="post('het.welcome')">❓ 入门</button>
    </div>`
    : '<h2>项目</h2><div class="card">未检测到 fcpp 项目 —— 打开含 metadata.json 的库文件夹。</div>';

  const actionButtons = `
  <h2>快捷动作</h2>
  <div class="card">
    <button onclick="post('het.build')">▶ 构建</button>
    <button onclick="post('het.refresh')">↻ 刷新</button>
    <button class="secondary" onclick="refresh()">🔍 重新体检</button>
  </div>`;

  const envCard = `<h2>环境</h2><div class="card">${toolChips || '<span class="tag">未检测</span>'}</div>`;
  const switchCard = `<h2>CI 流水线开关</h2><div class="card">${switches}<div class="sub">开关全关时提交标签不会触发任何 CI。</div></div>`;

  return pageShell(
    'HeT DevTools 驾驶舱',
    `<h1>HeT DevTools 驾驶舱</h1>
     <div class="grid">${projectCard}${scoreCard || ''}</div>
     ${actionButtons}
     <div class="grid">${envCard}${switchCard}</div>`,
  );
}
