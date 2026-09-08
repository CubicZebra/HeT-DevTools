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
  // workspace/fcpp is the maintainer's local reference copy (gitignored — the
  // repo never commits it). On a fresh clone / CI the source is absent; the
  // COMMITTED assets/template snapshot is then authoritative for packaging.
  if (existsSync(join(dest, 'metadata.json'))) {
    console.warn('[asset] workspace/fcpp 源缺失（CI/浅克隆）→ 沿用已提交的内置模板 assets/template。');
    console.warn('[asset] 注意：本地改动 workspace/fcpp 后需运行 npm run asset 并提交 assets/template 以保持同步。');
    process.exit(0);
  }
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
