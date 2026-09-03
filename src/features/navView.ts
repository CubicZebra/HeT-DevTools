import * as vscode from 'vscode';

/**
 * Activity-bar quick-entry view (left icon → cockpit shortcuts).
 * Gives first-time users a visible entry point to every major HeT action.
 */

interface QuickAction {
  id: string;
  cmd: string;
  icon?: string; // 仅主入口带图标；列表子项一律无图标（§3.4 克制原则）
  label: string;
  hint: string;
}

const ACTIONS: QuickAction[] = [
  { id: 'cockpit', cmd: 'het.cockpit', icon: 'rocket', label: '进入驾驶舱', hint: 'IDE 式集成工作台（推荐）' },
  { id: 'dashboard', cmd: 'het.dashboard', label: '概览（独立面板）', hint: '健康分 · 环境 · 动作' },
  { id: 'build', cmd: 'het.build', label: '构建项目', hint: 'conan create（诊断进问题面板）' },
  { id: 'test', cmd: 'het.test', label: '构建并测试', hint: 'GTest/CTest 结果视图' },
  { id: 'deps', cmd: 'het.openDeps', label: '依赖管理器', hint: '四桶依赖增删' },
  { id: 'module', cmd: 'het.newModule', label: '新增模块', hint: 'include/src 成对骨架' },
  { id: 'docs', cmd: 'het.docs', label: '文档中心', hint: 'Doxygen + Sphinx 双语' },
  { id: 'quality', cmd: 'het.quality', label: '质量与安全', hint: 'format/tidy/schema/commitlint' },
  { id: 'commit', cmd: 'het.commit', label: '提交助手', hint: 'type(:emoji:) 规范提交' },
  { id: 'audit', cmd: 'het.audit', label: '生成审计报告', hint: 'workspace/audit-report.md' },
  { id: 'preflight', cmd: 'het.preflight', label: '发布前检查', hint: '与 CI 门禁一致' },
  { id: 'newproject', cmd: 'het.newProject', label: '从模板初始化项目', hint: '版本锁定 / 离线可用' },
  { id: 'template', cmd: 'het.templateUpdate', label: '检查模板更新', hint: '只读对比 + 同步计划' },
];

export function registerNavView(context: vscode.ExtensionContext): void {
  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };
      const codiconCss = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'codicon.css')).toString();
      const html = (state: 'ok' | 'no-project'): string => `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<link rel="stylesheet" href="${codiconCss}">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); padding: 8px; }
  .banner { background: rgba(226,192,141,.15); border: 1px solid #e2c08d; border-radius: 6px;
    padding: 6px 8px; font-size: 11px; margin-bottom: 8px; }
  .btn { display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin: 2px 0;
    border-radius: 5px; cursor: pointer; border: 1px solid transparent; }
  .btn:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-widget-border,#333); }
  .ic { width: 18px; }
  .lb { font-size: 12px; }
  .hm { font-size: 10px; opacity: .7; }
</style></head><body>
${state === 'ok' ? '' : '<div class="banner">未检测到 fcpp 项目：打开含 metadata.json 的文件夹后状态自动就绪。</div>'}
${ACTIONS.map(
  (a) => `<div class="btn" data-cmd="${a.id}">${a.icon ? `<span class="ic"><i class="codicon codicon-${a.icon}"></i></span>` : ''}
    <span><div class="lb">${a.label}</div><div class="hm">${a.hint}</div></span></div>`,
).join('')}
<script>
  (function () {
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-cmd]').forEach((el) =>
      el.addEventListener('click', () => vscode.postMessage({ type: 'run', cmd: el.getAttribute('data-cmd') })));
  })();
</script></body></html>`;

      const render = (): void => {
        const hasProject = vscode.commands.executeCommand<boolean>('het.hasProject').then(
          (ok) => ok === true,
          () => false,
        );
        void hasProject.then((ok) => {
          webviewView.webview.html = html(ok ? 'ok' : 'no-project');
        });
      };
      render();
      webviewView.webview.onDidReceiveMessage((msg: { type: string; cmd?: string }) => {
        if (msg.type === 'run' && msg.cmd) {
          const action = ACTIONS.find((a) => a.id === msg.cmd);
          if (action) {
            void vscode.commands.executeCommand(action.cmd);
          }
        }
      });
      // re-render banner when the project state changes
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          render();
        }
      });
    },
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('het.quick', provider, { webviewOptions: { retainContextWhenHidden: true } }));
}
