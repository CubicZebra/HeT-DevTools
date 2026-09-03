import * as vscode from 'vscode';
import { initialCockpitState, reduceCockpit, CockpitEvent, CockpitState } from './state';
import { isCockpitPage, CockpitPage } from './layout';
import { buildCockpitHtml, buildPageContentHtml, renderCockpitRegions, PagePayload } from './webview/render';

/**
 * Cockpit controller (gui-rework-plan §7).
 * One integrated workspace webview (`het.cockpit`) driven by the pure
 * CockpitState reducer; events from existing host features are fed through
 * `emitCockpitEvent` so the drawer/status regions react contextually.
 */

let cockpitPanel: vscode.WebviewPanel | undefined;
let cockpitState: CockpitState = initialCockpitState();

/** Page → payload provider (P-G2 adapters; registered by the extension host). */
const pageProviders = new Map<CockpitPage, () => Promise<PagePayload>>();
/** Page → interactive action handler (P-G2 deep forms; page:action messages). */
const pageHandlers = new Map<CockpitPage, (action: string, data: Record<string, string>) => Promise<void>>();
/** Cached rendered main-region HTML per page. */
const pageHtmlCache = new Map<CockpitPage, string>();
/** Sequence guard for the post-run auto-collapse timer. */
let logDoneSeq = 0;

export function getCockpitState(): CockpitState {
  return cockpitState;
}

/** Register a page data provider (host adapters feed cockpit pages). */
export function setCockpitPageProvider(page: CockpitPage, provider: () => Promise<PagePayload>): void {
  pageProviders.set(page, provider);
}

/** Register a page action handler (deep forms post `cockpit:page:action`). */
export function setCockpitPageHandler(
  page: CockpitPage,
  handler: (action: string, data: Record<string, string>) => Promise<void>,
): void {
  pageHandlers.set(page, handler);
}

function postState(): void {
  if (!cockpitPanel) {
    return;
  }
  const regions = renderCockpitRegions(cockpitState);
  const cachedMain = pageHtmlCache.get(cockpitState.page);
  void cockpitPanel.webview.postMessage({
    type: 'cockpit:state',
    regions: { top: regions.top, rail: regions.rail, drawer: regions.drawer, main: cachedMain ?? regions.main },
  });
}

async function loadPage(page: CockpitPage): Promise<void> {
  const provider = pageProviders.get(page);
  if (!provider) {
    return;
  }
  try {
    const payload = await provider();
    pageHtmlCache.set(page, buildPageContentHtml(page, payload));
  } catch {
    pageHtmlCache.delete(page);
  }
  postState();
}

/** Feed a host-side event into the cockpit (no-op when the cockpit is closed). */
export function emitCockpitEvent(event: CockpitEvent): void {
  cockpitState = reduceCockpit(cockpitState, event);
  if (event.type === 'log:done') {
    const seq = ++logDoneSeq;
    setTimeout(() => {
      if (
        cockpitPanel &&
        seq === logDoneSeq &&
        cockpitState.top.running === null &&
        cockpitState.drawer.kind === 'log' &&
        cockpitState.drawer.expanded
      ) {
        cockpitState = reduceCockpit(cockpitState, { type: 'drawer:toggle', expand: false });
        postState();
      }
    }, 3000);
  }
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

  cockpitPanel.webview.onDidReceiveMessage((message: { type: string; page?: string; expand?: boolean; command?: string; action?: string; data?: Record<string, string> }) => {
    if (message.type === 'cockpit:navigate' && message.page && isCockpitPage(message.page)) {
      cockpitState = reduceCockpit(cockpitState, { type: 'navigate', page: message.page });
      postState();
      void loadPage(message.page);
    } else if (message.type === 'drawer:toggle') {
      cockpitState = reduceCockpit(cockpitState, { type: 'drawer:toggle', expand: message.expand === true });
      postState();
    } else if (message.type === 'page:action' && message.command) {
      void vscode.commands.executeCommand(message.command);
    } else if (message.type === 'cockpit:page:action' && message.action) {
      const handler = pageHandlers.get(cockpitState.page);
      const page = cockpitState.page;
      void (async () => {
        if (handler) {
          try {
            await handler(message.action as string, message.data ?? {});
          } catch {
            /* handler surfaces its own messaging */
          }
        }
        await loadPage(page);
      })();
    }
  });

  cockpitPanel.onDidDispose(() => {
    cockpitPanel = undefined;
  });

  void loadPage(cockpitState.page);
  return cockpitPanel;
}
