// Runs the C3 end-to-end check on a fresh fcpp copy that carries the template
// .github gates configs. Usage: npm run test:c3
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'out', 'c1-fcpp');
const templateGithub = join(root, 'workspace', 'fcpp', '.github');
const fixture = join(root, 'out', 'c3-fcpp');

rmSync(fixture, { recursive: true, force: true });
cpSync(source, fixture, {
  recursive: true,
  filter: (p) => !p.includes('test_package') || !(p.split(/[\\/]/).includes('build') && p.includes('test_package')),
});
// carry the template gate configs so quality rows are runnable (as in real repos)
cpSync(templateGithub, join(fixture, '.github'), { recursive: true });

// Turn the fixture into a real git repo with one conforming baseline commit,
// so the commit-assistant / preflight / release flows have something to read.
const git = (args) => execFileSync('git', ['-C', fixture, ...args], { stdio: 'pipe' });
try {
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'C3 Fixture']);
  git(['config', 'user.email', 'c3@example.invalid']);
  git(['add', '-A']);
  git(['commit', '-m', 'chore(release): 1.0.0 [skip ci]']);
  console.log('[c3] fixture git repo initialized');
} catch (err) {
  console.warn('[c3] git init failed (continuing): ' + String(err.message));
}

process.env.VSLANG = '1033';
process.env.HET_NO_UI = '1'; // automation: never show on-boarding/notifications
rmSync(join(root, '.vscode-test'), { recursive: true, force: true });

const candidates = [
  process.env.VSCODE_EXECUTABLE_PATH,
  'C:/Users/Chen/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '/usr/bin/code',
];
const vscodeExecutablePath = candidates.find((p) => p && existsSync(p));

async function main() {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out', 'test-integration', 'c3.js'),
    launchArgs: [fixture],
  });
  console.log('[c3] host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
