// Runs the C4 end-to-end check fully offline.
// Phase init: empty workspace bootstraps out/c4-newproj from a local template
// copy (out/tpl-dev, derived from workspace/fcpp). Phase check: after the
// runner advances the template by one commit, opens the new project and checks
// update-notice + audit + panels. Usage: npm run test:c4
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ref = join(root, 'workspace', 'fcpp');
const tpl = join(root, 'out', 'tpl-dev');
const newProj = join(root, 'out', 'c4-newproj');
const emptyWs = join(root, 'out', 'c4-host');
const tplAdvance = join(tpl, 'het-advance.txt');

// ---- prepare a local template git repo derived from the read-only reference ----
rmSync(tpl, { recursive: true, force: true });
rmSync(newProj, { recursive: true, force: true });
mkdirSync(emptyWs, { recursive: true });
if (existsSync(join(ref, '.git'))) {
  execFileSync('git', ['clone', ref, tpl], { stdio: 'pipe' });
} else {
  cpSync(ref, tpl, { recursive: true });
  execFileSync('git', ['-C', tpl, 'init', '-b', 'main'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'config', 'user.name', 'TPL'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'config', 'user.email', 'tpl@example.invalid'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'add', '-A'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'commit', '-m', 'feat(:building_construction:): template baseline'], { stdio: 'pipe' });
}
console.log('[c4] local template ready at ' + tpl);

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));
process.env.HET_TEMPLATE_LOCAL = tpl;
process.env.HET_C4_DEST = newProj;
process.env.VSLANG = '1033';
process.env.HET_NO_UI = '1'; // automation: never show on-boarding/notifications
rmSync(join(root, '.vscode-test'), { recursive: true, force: true });

/** Kill any test VS Code still holding the .vscode-test user-data dir. */
function killTestCode() {
  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='Code.exe'\" | Where-Object { $_.CommandLine -like '*\\.vscode-test*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ], { stdio: 'ignore' });
  } catch { /* best-effort */ }
}

/** Run one phase; if the window shows no sign of completing within 4 min, kill it. */
async function runPhase(name, ws) {
  process.env.HET_C4_PHASE = name;
  const p = runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c4.js'),
    launchArgs: [ws],
  });
  const done = await Promise.race([
    p.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 4 * 60_000)),
  ]);
  if (!done) {
    killTestCode();
    throw new Error(`[c4] ${name}-phase window alive >4 min without completing — force killed`);
  }
  console.log(`[c4] ${name} host exited cleanly`);
}

async function main() {
  // phase init (empty workspace)
  await runPhase('init', emptyWs);

  // advance the template by exactly one commit → update check must report 1
  writeFileSync(tplAdvance, 'template advanced by C4 runner\n', 'utf8');
  execFileSync('git', ['-C', tpl, 'config', 'user.name', 'TPL'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'config', 'user.email', 'tpl@example.invalid'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'add', '-A'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tpl, 'commit', '-m', 'docs(:book:): advance template for C4'], { stdio: 'pipe' });
  console.log('[c4] template advanced by 1 commit');

  // phase check (new project workspace)
  await runPhase('check', newProj);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
