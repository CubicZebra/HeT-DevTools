/**
 * V4-6 Level-2 HUD card host: a single-instance webview that reuses/reveals.
 * Messages: command (run an action), close (Esc), snooze (hide chip 5 min),
 * hideHud (fall back to the QuickPick list). HTML is pure (hudModel).
 */
import * as vscode from 'vscode';
import { HudModel, hudHtml } from './hudModel';

export interface HudDeps {
  getModel: () => Promise<HudModel>;
  fontSize: () => number;
  /** Hide the status chip for ~5 minutes. */
  onSnooze: () => void;
  /** Disable the HUD → chip click falls back to the QuickPick list. */
  onHideHud: () => void;
}

let panelRef: vscode.WebviewPanel | undefined;

export function openHudPanel(context: vscode.ExtensionContext, deps: HudDeps): vscode.WebviewPanel {
  if (panelRef) {
    panelRef.reveal(vscode.ViewColumn.Active);
    void render(panelRef, deps);
    return panelRef;
  }
  const panel = vscode.window.createWebviewPanel(
    'het.hud',
    'HeT 监控卡',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [context.extensionUri] },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
  panelRef = panel;
  panel.onDidDispose(() => {
    if (panelRef === panel) {
      panelRef = undefined;
    }
  });
  panel.webview.onDidReceiveMessage((message: { type: string; command?: string }) => {
    if (message.type === 'close') {
      void panel.dispose();
    } else if (message.type === 'snooze') {
      deps.onSnooze();
    } else if (message.type === 'hideHud') {
      deps.onHideHud();
    } else if (message.type === 'command' && message.command) {
      void vscode.commands.executeCommand(message.command);
    }
  });
  void render(panel, deps).catch((e) => console.error('[het] HUD render failed', e));
  return panel;
}

async function render(panel: vscode.WebviewPanel, deps: HudDeps): Promise<void> {
  const model = await deps.getModel();
  panel.webview.html = hudHtml(model, deps.fontSize());
}
