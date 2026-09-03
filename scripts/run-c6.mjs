// Runs the C6 check fully offline (two phases: empty workspace → chip hint,
// mini-fcpp project → chip + dashboard section focus + deps commands).
// Usage: npm run test:c6
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const emptyWs = join(root, 'out', 'c6-ws');
const miniFcpp = join(root, 'src', 'test', 'fixtures', 'mini-fcpp');

mkdirSync(emptyWs, { recursive: true });

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  join(root, 'out', 'code-test', 'vscode-win32-x64-archive-1.136.1', 'Code.exe'),
  '/usr/bin/code',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));
process.env.VSLANG = '1033';

async function main() {
  process.env.HET_C6_PHASE = 'empty';
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c6.js'),
    launchArgs: [emptyWs],
  });
  console.log('[c6] empty-phase host exited cleanly');

  process.env.HET_C6_PHASE = 'proj';
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c6.js'),
    launchArgs: [miniFcpp],
  });
  console.log('[c6] project-phase host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
