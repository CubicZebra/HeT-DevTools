import * as vscode from 'vscode';
import { initialCockpitState, reduceCockpit, CockpitEvent, CockpitState } from './state';
import { isCockpitPage } from './layout';
import { buildCockpitHtml, renderCockpitRegions } from './webview/render';

/**
 * Cockpit controller (gui-rework-plan §7).
 * One integrated workspace webview (`het.cockpit`) driven by the pure
 * CockpitState reducer; events from existing host features are fed through
 * `emitCockpitEvent` so the drawer/status regions react contextually.
 */

let cockpitPanel: vscode.WebviewPanel | undefined;
let cockpitState: CockpitState = initialCockpitState();

export function getCockpitState(): CockpitState {
  return cockpitState;
}

function postState(): void {
  if (!cockpitPanel) {
    return;
  }
  void cockpitPanel.webview.postMessage({ type: 'cockpit:state', regions: renderCockpitRegions(cockpitState) });
}

/** Feed a host-side event into the cockpit (no-op when the cockpit is closed). */
export function emitCockpitEvent(event: CockpitEvent): void {
  cockpitState = reduceCockpit(cockpitState, event);
  postState();
}

export function openCockpitPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  if (cockpitPanel) {
    cockpitPanel.reveal(vscode.ViewColumn.One);
    return cockpitPanel;
  }
  cockpitPanel = vscode.window.createWebviewPanel(
    'het.cockpit',
    'HeT DevTools 驾驶舱',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] },
  );
  cockpitPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  const assets = {
    codiconCss: cockpitPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'codicon.css')).toString(),
  };
  cockpitPanel.webview.html = buildCockpitHtml(cockpitState, assets);

  cockpitPanel.webview.onDidReceiveMessage((message: { type: string; page?: string; expand?: boolean; command?: string }) => {
    if (message.type === 'cockpit:navigate' && message.page && isCockpitPage(message.page)) {
      cockpitState = reduceCockpit(cockpitState, { type: 'navigate', page: message.page });
      postState();
    } else if (message.type === 'drawer:toggle') {
      cockpitState = reduceCockpit(cockpitState, { type: 'drawer:toggle', expand: message.expand === true });
      postState();
    } else if (message.type === 'page:action' && message.command) {
      void vscode.commands.executeCommand(message.command);
    }
  });

  cockpitPanel.onDidDispose(() => {
    cockpitPanel = undefined;
  });
  return cockpitPanel;
}
