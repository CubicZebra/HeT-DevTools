// Runs the extension-host integration smoke test against the locally installed
// VS Code (no download). Usage: node scripts/run-integration.mjs
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'src', 'test', 'fixtures', 'mini-fcpp');

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));

async function main() {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'index.js'),
    launchArgs: [fixture],
  });
  console.log('[integration-smoke] host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
