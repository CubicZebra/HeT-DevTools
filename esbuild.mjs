// HeT DevTools — esbuild build script.
//  - bundles src/extension.ts -> out/extension.js (single file, external: vscode)
//  - --tests : bundles every src/test/**/*.test.ts -> out/test/** (kept relative)
//  - --watch : rebuild on change
import * as esbuild from 'esbuild';
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src');
const outDir = join(root, 'out');

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const tests = args.includes('--tests');
const integration = args.includes('--integration');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  sourcesContent: false,
  logLevel: 'info',
  external: ['vscode'],
};

function collectTsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function buildOptions() {
  const options = [];
  const wantMain = !tests && !integration;

  // 1) main extension bundle (skipped in tests/integration-only modes)
  if (wantMain) {
    options.push({
      ...common,
      entryPoints: [join(srcDir, 'extension.ts')],
      outfile: join(outDir, 'extension.js'),
    });
  }

  // 2) unit tests (when requested)
  if (tests) {
    const testRoot = join(srcDir, 'test');
    if (exists(testRoot)) {
      for (const file of collectTsFiles(testRoot)) {
        if (!file.endsWith('.test.ts')) {
          continue;
        }
        const rel = relative(srcDir, file).replace(/\.ts$/, '.js');
        const outfile = join(outDir, rel);
        mkdirSync(dirname(outfile), { recursive: true });
        options.push({ ...common, entryPoints: [file], outfile });
      }
    }
  }

  // 3) extension-host integration smoke test (when requested)
  if (integration) {
    options.push({
      ...common,
      entryPoints: [join(srcDir, 'test', 'integration', 'index.ts')],
      outfile: join(outDir, 'test-integration', 'index.js'),
    });
  }
  return options;
}

async function runAll(builds) {
  if (watch) {
    const contexts = [];
    for (const o of builds) {
      const ctx = await esbuild.context(o);
      await ctx.watch();
      contexts.push(ctx);
    }
    return contexts;
  }
  await Promise.all(builds.map((o) => esbuild.build(o)));
}

function exists(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

runAll(buildOptions()).catch((e) => {
  console.error(e);
  process.exit(1);
});
