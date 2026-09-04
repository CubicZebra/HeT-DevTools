// Runs the C2 end-to-end check on a fresh copy of the working fcpp project
// (out/c2-fcpp). Usage: npm run test:c2
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, existsSync, rmSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'out', 'c1-fcpp');
const fixture = join(root, 'out', 'c2-fcpp');
const binutils = join(root, 'out', 'binutils');
const c1Profile = join(root, 'out', 'c1-profile2.txt');

// Fresh working copy (skip heavy build dirs that only live under the c1 tree).
rmSync(fixture, { recursive: true, force: true });
cpSync(source, fixture, {
  recursive: true,
  filter: (p) =>
    !p.includes('test_package') ||
    (() => {
      // keep test sources, drop stale test_package/build caches
      const seg = p.split(/[\\/]/);
      return !(seg.includes('build') && p.includes('test_package'));
    })(),
});

const defaultProfile = join(
  process.env.USERPROFILE ?? 'C:/Users/Chen',
  '.conan2',
  'profiles',
  'default',
);
process.env.HET_CONAN_PROFILES = defaultProfile + ';' + c1Profile;
process.env.PATH = binutils + ';' + (process.env.PATH ?? '');
process.env.VSLANG = '1033';
process.env.HET_NO_UI = '1'; // automation: never show on-boarding/notifications
rmSync(join(root, '.vscode-test'), { recursive: true, force: true });
rmSync(join(fixture, 'test_package', 'build'), { recursive: true, force: true });

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
    extensionTestsPath: join(root, 'out', 'test-integration', 'c2.js'),
    launchArgs: [fixture],
  });
  console.log('[c2] host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
