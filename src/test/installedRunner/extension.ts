// Installed-verification runner extension: no-op host so the extensionTests
// file below can run against the INSTALLED het-devtools (separate id).
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  // nothing to do — presence is what matters
}
