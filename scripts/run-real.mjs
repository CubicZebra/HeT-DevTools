// P2 cross-platform REAL host runner (macOS native / Linux).
// Prepares a real project from the COMMITTED assets/template (coverage off —
// macOS has no GNU lcov/gcov; the coverage lane stays Linux/WSL DoD + verify),
// then launches a real VS Code extension host on the CURRENT platform and runs
// src/test/integration/realBuild.ts through the extension.
// Usage: npm run test:real   (needs VSCODE_VERSION or a local VS Code)
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync, rmSync, readFileSync, writeFileSync, cpSync, accessSync, constants as fsConsts } from 'node:fs';
import { platform } from 'node:os';

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
// Coverage stays ON for Linux (the managed lane runs lcov/genhtml — real
// lane-coverage validation). macOS has no GNU gcov/lcov, so disable it there.
if (platform() === 'darwin' && meta.activate_code_coverage !== false) {
  meta.activate_code_coverage = false;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}
console.log(`[real] project fixture ready: ${proj} (coverage=${meta.activate_code_coverage ? 'on' : 'off'})`);

// Native macOS docs must run under the SAME python that owns conan + the docs
// deps (the CI conan venv /tmp/het-conan, where sphinx/numpy are installed).
// The runner PATH may list a system `python` before that venv, so which('python')
// inside the extension host would pick an interpreter WITHOUT numpy and
// docs/build.py crashes at `import numpy`. Prepend the venv so python/python3
// resolve deterministically (no-op on a dev box without that venv).
if (platform() !== 'win32') {
  for (const venvBin of ['/tmp/het-conan/bin']) {
    if (existsSync(join(venvBin, 'python')) && process.env.PATH) {
      // Force to the FRONT even if already listed (the runner may append the
      // venv AFTER a system python, which shadows it for which('python')).
      const parts = process.env.PATH.split(':').filter((p) => p && p !== venvBin);
      process.env.PATH = `${venvBin}:${parts.join(':')}`;
      console.log('[real] prepended to PATH: ' + venvBin);
    }
  }
}

function isExec(p) {
  try {
    accessSync(p, fsConsts.X_OK);
    return true;
  } catch {
    return false;
  }
}

// macOS: locate the app's MAIN executable without hardcoding its name (the
// cask layout has varied: Electron / Visual Studio Code / …). Prefer the known
// names, else the first executable that is not a Helper.
function macAppExecutable() {
  const app = '/Applications/Visual Studio Code.app';
  const macosDir = join(app, 'Contents', 'MacOS');
  if (!existsSync(macosDir)) {
    return undefined;
  }
  const known = ['Electron', 'Visual Studio Code', 'Code'];
  for (const name of known) {
    const p = join(macosDir, name);
    if (isExec(p)) {
      return p;
    }
  }
  let entries = [];
  try {
    entries = readdirSync(macosDir);
  } catch {
    return undefined;
  }
  for (const name of entries) {
    if (/ Helper(\.app)?$/i.test(name)) {
      continue;
    }
    const p = join(macosDir, name);
    if (isExec(p)) {
      return p;
    }
  }
  return undefined;
}

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  ...(platform() === 'darwin' ? [macAppExecutable()] : []),
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
].filter(Boolean);
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p) && isExec(p));
if (vscodeExecutablePath) {
  console.log('[real] using VS Code executable: ' + vscodeExecutablePath);
}

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
