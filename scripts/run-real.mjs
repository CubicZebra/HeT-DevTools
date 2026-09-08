// P2 cross-platform REAL host runner (macOS native / Linux).
// Prepares a real project from the COMMITTED assets/template (coverage off —
// macOS has no GNU lcov/gcov; the coverage lane stays Linux/WSL DoD + verify),
// then launches a real VS Code extension host on the CURRENT platform and runs
// src/test/integration/realBuild.ts through the extension.
// Usage: npm run test:real   (needs VSCODE_VERSION or a local VS Code)
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, rmSync, readFileSync, writeFileSync, cpSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tpl = join(root, 'assets', 'template');
const proj = join(root, 'out', 'real-proj');

if (!existsSync(join(tpl, 'metadata.json'))) {
  console.error('[real] committed template missing under assets/template');
  process.exit(1);
}

// Fresh project copy from the committed template (deterministic on CI).
rmSync(proj, { recursive: true, force: true });
cpSync(tpl, proj, { recursive: true });
const metaPath = join(proj, 'metadata.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
// Coverage off for the cross-platform real build (macOS lacks GNU lcov/gcov).
if (meta.activate_code_coverage !== false) {
  meta.activate_code_coverage = false;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}
console.log('[real] project fixture ready: ' + proj);

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));

async function main() {
  const opts = {
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'realBuild.js'),
    launchArgs: [proj],
  };
  if (vscodeExecutablePath) {
    opts.vscodeExecutablePath = vscodeExecutablePath;
  } else if (!process.env.VSCODE_VERSION) {
    throw new Error('no local VS Code found and VSCODE_VERSION not set');
  }
  await runTests(opts);
  console.log('[real] host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
