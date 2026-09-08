// Runs the C7 template-acquisition fallback check (marketplace-readiness E2).
// Forces the "recommended online pin" offline (HET_FORCE_TEMPLATE_OFFLINE=1),
// so `tryRemote` fails deterministically and the extension must fall back to
// the local candidate chain (workspace/fcpp dev copy) — exactly like a real
// GitHub outage, but fast and reproducible. Usage: npm run test:c7
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ws = join(root, 'out', 'c7-host');
const dest = join(root, 'out', 'c7-proj');
rmSync(ws, { recursive: true, force: true });
rmSync(dest, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));
if (!vscodeExecutablePath) {
  console.error('[c7] no VS Code executable found — run an integration test first');
  process.exit(1);
}

process.env.HET_C7_DEST = dest;
process.env.HET_FORCE_TEMPLATE_OFFLINE = '1';
process.env.VSLANG = '1033';
process.env.HET_NO_UI = '1'; // zero-manual host: no toasts/onboarding
delete process.env.HET_TEMPLATE_LOCAL; // remote pin path must be attempted first
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

async function main() {
  const p = runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c7.js'),
    launchArgs: [ws],
  });
  const done = await Promise.race([
    p.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 4 * 60_000)),
  ]);
  if (!done) {
    killTestCode();
    console.error('[c7] host alive >4 min without completing — force killed');
    process.exit(1);
  }
  console.log('[c7] host exited cleanly');
}

main().catch((e) => {
  console.error('[c7] FAILED: ' + (e?.message ?? e));
  process.exit(1);
});
