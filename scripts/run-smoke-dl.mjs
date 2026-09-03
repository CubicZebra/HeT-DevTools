// Temporary offline smoke runner using a downloaded VS Code copy (avoids the
// user's installed Code being mid-update). NOT committed long-term.
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'src', 'test', 'fixtures', 'mini-fcpp');

process.env.VSCODE_VERSION = process.env.VSCODE_VERSION || '1.96.4';

async function main() {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'index.js'),
    launchArgs: [fixture],
  });
  console.log('[integration-smoke] host exited cleanly (downloaded copy)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
