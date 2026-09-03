import * as vscode from 'vscode';
import { DashboardSnapshot, esc, pageShell } from '../ui';

export interface WelcomePanelDeps {
  getSnapshot: () => Promise<DashboardSnapshot>;
  runCommand: (command: string) => void;
  onDismiss: () => void;
}

export function showWelcomePanel(context: vscode.ExtensionContext, deps: WelcomePanelDeps): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'het.welcome',
    'HeT DevTools — 入门',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const render = async (): Promise<void> => {
    const snapshot = await deps.getSnapshot();
    panel.webview.html = buildWelcomeHtml(snapshot);
  };

  panel.webview.onDidReceiveMessage((message: { type: string; command?: string }) => {
    if (message.type === 'command' && message.command) {
      if (message.command === 'het.dismissWelcome') {
        deps.onDismiss();
        panel.dispose();
        return;
      }
      deps.runCommand(message.command);
    }
  });

  void render().catch((e) => console.error('[het] welcome render failed', e));
  return panel;
}

function step(no: number, title: string, body: string): string {
  return `
  <div class="card">
    <h2>步骤 ${no} · ${esc(title)}</h2>
    <div>${body}</div>
  </div>`;
}

function buildWelcomeHtml(snapshot: DashboardSnapshot): string {
  const project = snapshot.project;
  const m = project?.metadata;
  const toolNames = Object.values(snapshot.tools).map((t) => t.name);

  const projectLine = m
    ? `项目：<b>${esc(m.name)} v${esc(m.version ?? '0.0.0')}</b>（C++${esc(m.build_cppstd ?? '17')} · ${esc(m.build_type ?? 'Debug')}）`
    : '未检测到 fcpp 项目';

  const envLine =
    toolNames.length > 0
      ? `已探测工具：${toolNames.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}`
      : '尚未探测环境，点击“打开驾驶舱”查看。';

  return pageShell(
    'HeT DevTools — 入门',
    `<h1>⚡ HeT DevTools</h1>
     <div class="sub">你的 C/C++ 工程管家 —— 只写 include/src，剩下的交给它。</div>

     ${step(
       1,
       '认识项目',
       `${projectLine}
        <div class="sub">本扩展由 fcpp 模板驱动：构建、测试、文档、发布、质量检查都会自动发生，你不需要了解内部细节。</div>`,
     )}

     ${step(
       2,
       '检查环境',
       `${envLine}
        <div class="sub">构建需要 Python + Conan；缺失项只影响对应功能，会有明确提示。</div>`,
     )}

     ${step(
       3,
       '首次构建',
       `<div>点击下方按钮完成首次构建（首次需下载依赖，可能耗时数分钟）。</div>
        <button onclick="post('het.build')">▶ 开始构建</button>
        <button class="secondary" onclick="post('het.dashboard')">🔍 先看环境与健康</button>`,
     )}

     <div style="margin-top:14px">
       <button onclick="post('het.dashboard')">🚀 打开驾驶舱</button>
       <button class="secondary" onclick="post('het.dismissWelcome')">✕ 以后再看</button>
     </div>`,
  );
}
