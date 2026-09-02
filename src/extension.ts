import * as vscode from 'vscode';
import { EXTENSION_ID, LOG_CHANNEL_NAME, log, setOutputChannel } from './constants';

let channel: vscode.OutputChannel | undefined;
let activationLine = '';

/**
 * Read-only activation evidence (also written to the "HeT DevTools" output
 * channel). Exposed so the automated integration smoke test can assert the
 * exact activation line without manual F5 inspection.
 */
export function getActivationLine(): string {
  return activationLine;
}

/**
 * HeT DevTools — entry point.
 *
 * Phase 0 skeleton: creates the shared output channel and registers a smoke
 * command so F5 activation is verifiable. Features are wired in later phases
 * (see workspace/develope/development-plan.md).
 */
export function activate(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
  setOutputChannel(channel);
  context.subscriptions.push(channel);
  activationLine = `activated — ${EXTENSION_ID} v${context.extension.packageJSON.version}`;
  log(activationLine);

  context.subscriptions.push(
    vscode.commands.registerCommand('het.hello', () => {
      void vscode.window.showInformationMessage('HeT DevTools smoke test passed ✔');
    }),
    vscode.commands.registerCommand('het.getActivationLine', () => activationLine),
  );
}

export function deactivate(): void {
  log('deactivated');
}
