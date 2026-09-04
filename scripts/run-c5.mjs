// Runs the C5 cockpit check fully offline:
//   Phase "empty": empty workspace → cockpit opens, five-step wizard auto-opens.
//   Phase "proj":  mini-fcpp fixture → cockpit opens cleanly (no wizard).
// Usage: npm run test:c5
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const emptyWs = join(root, 'out', 'c5-ws');
const miniFcpp = join(root, 'src', 'test', 'fixtures', 'mini-fcpp');

mkdirSync(emptyWs, { recursive: true });

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));
process.env.VSLANG = '1033';
process.env.HET_NO_UI = '1'; // automation: never show on-boarding/notifications
rmSync(join(root, '.vscode-test'), { recursive: true, force: true });

async function main() {
  process.env.HET_C5_PHASE = 'empty';
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c5.js'),
    launchArgs: [emptyWs],
  });
  console.log('[c5] empty-phase host exited cleanly');

  process.env.HET_C5_PHASE = 'proj';
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c5.js'),
    launchArgs: [miniFcpp],
  });
  console.log('[c5] project-phase host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
