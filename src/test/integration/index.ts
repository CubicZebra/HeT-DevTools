/**
 * Extension-host integration smoke test (T-0.2 DoD proof).
 *
 * Loaded via @vscode/test-electron with the mini-fcpp fixture opened as the
 * workspace, so the "workspace contains metadata.json" activation event fires.
 * Asserts that the extension activates and its registered command executes.
 *
 * Run with:  npm run test:integration
 */
import * as assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'het-fti.het-devtools';

export async function run(): Promise<void> {
  console.log('[integration-smoke] starting');

  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext, 'extension must be discovered in the test host: ' + EXTENSION_ID);

  await ext.activate();
  assert.strictEqual(ext.isActive, true, 'extension must be active after activate()');

  // The activation line written to the "HeT DevTools" output channel must exist.
  // Read via a registered command (deterministic; ext.exports can be flaky).
  const activationLine = (await vscode.commands.executeCommand<string>('het.getActivationLine')) ?? '';
  assert.ok(
    activationLine.includes('activated \u2014 het-fti.het-devtools'),
    'expected activation line, got: ' + activationLine,
  );
  // Durable evidence for the outer runner (host stdout forwarding is unreliable).
  writeFileSync(join(__dirname, '..', 'activation-evidence.txt'), activationLine + '\n', 'utf8');
  console.log('[integration-smoke] activation = ' + activationLine);

  await vscode.commands.executeCommand('het.hello');

  const folders = vscode.workspace.workspaceFolders ?? [];
  assert.ok(folders.length > 0, 'expected a workspace folder (mini-fcpp fixture)');
  console.log('[integration-smoke] OK - extension active in ' + folders[0].uri.fsPath);
}
