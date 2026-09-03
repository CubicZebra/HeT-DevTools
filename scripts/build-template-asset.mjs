// Bundles the fcpp reference template (workspace/fcpp) into assets/template
// so packaged vsix installs can create new projects fully offline.
// Excludes version-control + build noise only (template is ~2 MB).
// Usage: node scripts/build-template-asset.mjs   (also run by `npm run package`)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'workspace', 'fcpp');
const dest = join(root, 'assets', 'template');

if (!existsSync(join(src, 'metadata.json'))) {
  console.error(`[asset] template source missing: ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const excludedPath = (p) => {
  const norm = p.replace(/\\/g, '/');
  return (
    norm.includes('/.git/') ||
    norm.includes('/.vscode-test/') ||
    norm.includes('/node_modules/') ||
    norm.includes('/docs/sphinx/build/') ||
    norm.includes('/docs/doxygen/build/') ||
    norm.includes('/benchmark/build/')
  );
};
const excludedBase = new Set(['out', 'build', '.git', '.vscode-test', 'node_modules']);

cpSync(src, dest, {
  recursive: true,
  filter: (p) => {
    if (excludedPath(p)) {
      return false;
    }
    const base = p.split(/[\\/]/).pop() ?? '';
    return !excludedBase.has(base);
  },
});

if (!existsSync(join(dest, 'metadata.json'))) {
  console.error('[asset] bundled template missing metadata.json after copy');
  process.exit(1);
}
console.log('[asset] bundled template ready at ' + dest);
