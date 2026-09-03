// Zero-manual verification of the INSTALLED het-devtools vsix.
//
//   1. Installs het-devtools-0.1.0.vsix into an isolated extensions dir of a
//      downloaded VS Code copy (out/code-test) — no human action at all.
//   2. Bundles a tiny "verify runner" extension (id het-verify-runner) that
//      does NOT contain het-devtools, so the only het extension present is the
//      installed one.
//   3. Runs two automated phases (empty workspace → create projects offline;
//      then the created project → detect/chip/dashboard).
//
// Usage:  node scripts/verify-installed.mjs   (after `npm run package`)
import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const codeDir = join(root, 'out', 'code-test', 'vscode-win32-x64-archive-1.136.1');
const codeExe = join(codeDir, 'Code.exe');
const vsix = join(root, 'het-devtools-0.1.0.vsix');

const runnerDir = join(root, 'out', 'verifyRunner');
const extDir = join(root, 'out', 'verify-ext');
const udDir = join(root, 'out', 'verify-ud');
const emptyWs = join(root, 'out', 'verify-ws');
const proj = join(root, 'out', 'verify-proj');

if (!existsSync(codeExe)) {
  console.error('[verify-installed] downloaded VS Code missing: run an integration test first');
  process.exit(1);
}
if (!existsSync(vsix)) {
  console.error('[verify-installed] vsix missing: run `npm run package` first');
  process.exit(1);
}

// 1) "install" the vsix into an isolated extensions dir (offline, deterministic):
//    a .vsix is a zip whose `extension/` root is the extension folder.
rmSync(extDir, { recursive: true, force: true });
rmSync(udDir, { recursive: true, force: true });
rmSync(runnerDir, { recursive: true, force: true });
const tmp = join(root, 'out', 'verify-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(emptyWs, { recursive: true });
rmSync(proj, { recursive: true, force: true });
execFileSync('tar', ['-xf', vsix, '-C', tmp], { stdio: 'pipe' });
const installed = join(extDir, 'het-fti.het-devtools-0.1.0');
cpSync(join(tmp, 'extension'), installed, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
if (!existsSync(join(installed, 'assets', 'template', 'metadata.json'))) {
  console.error('[verify-installed] FATAL: installed vsix has no assets/template/metadata.json');
  process.exit(1);
}
console.log('[verify-installed] vsix installed; bundled template present');

// 2) bundle the verify runner (extension + tests)
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: false, logLevel: 'warning' };
mkdirSync(join(runnerDir), { recursive: true });
cpSync(join(root, 'src', 'test', 'installedRunner', 'package.json'), join(runnerDir, 'package.json'));
await Promise.all([
  build({ ...common, entryPoints: [join(root, 'src', 'test', 'installedRunner', 'extension.ts')], outfile: join(runnerDir, 'extension.js') }),
  build({ ...common, entryPoints: [join(root, 'src', 'test', 'installedRunner', 'verify.ts')], outfile: join(runnerDir, 'verify.js') }),
]);

process.env.VSLANG = '1033';
process.env.HET_VERIFY_DEST = proj;

const launch = (workspace, phase) => ({
  vscodeExecutablePath: codeExe,
  extensionDevelopmentPath: runnerDir,
  extensionTestsPath: join(runnerDir, 'verify.js'),
  launchArgs: [workspace, '--extensions-dir', extDir, '--user-data-dir', udDir],
  ...(phase ? { extraArgs: undefined } : {}),
});
process.env.HET_VERIFY_PHASE = 'empty';
// runTests env: we need the extension tests host to see HET_VERIFY_* — it
// inherits process env automatically.
await runTests(launch(emptyWs, 'empty'));
console.log('[verify-installed] empty-phase host exited cleanly');

process.env.HET_VERIFY_PHASE = 'proj';
await runTests(launch(proj, 'proj'));
console.log('[verify-installed] proj-phase host exited cleanly');

// 3) scrub phase: a plain PowerShell PATH (no conda anywhere) — the extension
//    must sniff the conda env by itself and run a real `conan create`.
const saved = {
  PATH: process.env.PATH,
  CONDA_EXE: process.env.CONDA_EXE,
  CONDA_PREFIX: process.env.CONDA_PREFIX,
  MAMBA_ROOT_PREFIX: process.env.MAMBA_ROOT_PREFIX,
};
delete process.env.CONDA_EXE;
delete process.env.CONDA_PREFIX;
delete process.env.MAMBA_ROOT_PREFIX;
const defaultProfile = join(process.env.USERPROFILE ?? 'C:/Users/Chen', '.conan2', 'profiles', 'default');
const c1Profile = join(root, 'out', 'c1-profile2.txt');
process.env.HET_CONAN_PROFILES = defaultProfile + ';' + c1Profile;
process.env.PATH = [join(root, 'out', 'binutils'), 'C:/Windows/System32', 'C:/Windows'].join(';');
process.env.HET_VERIFY_PHASE = 'scrub';
await runTests(launch(proj, 'scrub'));
console.log('[verify-installed] scrub-phase host exited cleanly');
process.env.PATH = saved.PATH;
if (saved.CONDA_EXE !== undefined) { process.env.CONDA_EXE = saved.CONDA_EXE; }
if (saved.CONDA_PREFIX !== undefined) { process.env.CONDA_PREFIX = saved.CONDA_PREFIX; }
if (saved.MAMBA_ROOT_PREFIX !== undefined) { process.env.MAMBA_ROOT_PREFIX = saved.MAMBA_ROOT_PREFIX; }

console.log('[verify-installed] ALL OK — installed vsix verified with zero manual interaction');
