// Runs the C1 end-to-end check against the local working fcpp copy
// (out/c1-fcpp). Usage: npm run test:c1
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { rmSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'out', 'c1-fcpp');
const binutils = join(root, 'out', 'binutils');
const c1Profile = join(root, 'out', 'c1-profile2.txt');

// Dev-machine adaptations the extension would otherwise lack.
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
// Fresh test-package build: a stale CMake cache can fail to re-find the C
// compiler when the host re-configures outside the Conan environment.
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
    extensionTestsPath: join(root, 'out', 'test-integration', 'c1.js'),
    launchArgs: [fixture],
  });
  console.log('[c1] host exited cleanly');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
