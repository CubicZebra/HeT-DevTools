/**
 * P2 cross-platform REAL host — macOS native / Linux extension-host run.
 *
 * Opens a REAL project copied from the COMMITTED assets/template (present on
 * fresh clones/CI — workspace/fcpp is gitignored) with coverage disabled, then
 * drives the actual toolchain loop through host commands on the HOST platform:
 *   provider decision (macos-native / linux-managed|linux-native) →
 *   `het.test` (REAL conan create + GTest) → asserts.
 *
 * The point: a genuine macos-native build (Apple clang via conan detect) and a
 * genuine Linux build must succeed through the extension — CI-only evidence,
 * since this box is Windows. Run with:  npm run test:real
 * (workflow: .github/workflows/ci.yml › platform-real)
 */
import * as assert from 'node:assert';
import { writeFileSync, readFileSync, readdirSync, accessSync, constants as fsConsts } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'het-test-publisher.het-devtools';

interface ProviderPlan {
  provider?: string;
  coverage?: string;
  reason?: string;
}

/** Recursive, bounded search for a file/dir below `root` (skips node_modules). */
function findUnder(root: string, targetName: string, wantFile: boolean, depth = 0): string | null {
  if (depth > 9) {
    return null;
  }
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) {
      continue;
    }
    const p = join(root, e.name);
    if (e.name === targetName) {
      if (!wantFile || e.isFile()) {
        try {
          accessSync(p, fsConsts.R_OK);
          return p;
        } catch {
          return null;
        }
      }
    }
    if (e.isDirectory()) {
      const sub = findUnder(p, targetName, wantFile, depth + 1);
      if (sub) {
        return sub;
      }
    }
  }
  return null;
}

/** Parse genhtml index.html line coverage % (same rule as coverage/report). */
function readCoveragePct(reportDir: string): string {
  try {
    const html = readFileSync(join(reportDir, 'index.html'), 'utf8');
    const m = /(\d+(?:\.\d+)?)\s*%\s*<\/td>\s*<td class="headerCovTableEntryLo">/u.exec(html) ?? /lines:.*?(\d+(?:\.\d+)?)%/u.exec(html);
    return m?.[1] ?? '?';
  } catch {
    return '?';
  }
}

export async function run(): Promise<void> {
  console.log('[real] starting on ' + process.platform);
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext, 'extension must be discovered');
  await ext.activate();

  // Provider decision must match the real host (heuristic, capability-first).
  const plan = (await vscode.commands.executeCommand('het.getProvisionPlan', true)) as ProviderPlan | null;
  assert.ok(plan && plan.provider, 'provision plan must resolve on the real host');
  const expected =
    process.platform === 'darwin' ? ['macos-native'] : process.platform === 'linux' ? ['linux-managed', 'linux-native'] : [];
  assert.ok(expected.includes(plan!.provider ?? ''), `provider ${plan!.provider} not expected on ${process.platform} (${expected.join('/')})`);
  console.log(`[real] provider=${plan!.provider} coverage=${plan!.coverage} · ${plan!.reason ?? ''}`);

  await vscode.commands.executeCommand('het.refresh');
  const name = await vscode.commands.executeCommand<string | null>('het.getCurrentProject');
  assert.strictEqual(name, 'fcpp', 'expected the template project (fcpp), got: ' + name);

  // Dashboard opens without throwing (light UI sanity on the host).
  await vscode.commands.executeCommand('het.dashboard');
  await new Promise((r) => setTimeout(r, 400));

  console.log('[real] running het.test (REAL conan create + gtest)…');
  await vscode.commands.executeCommand('het.test');

  const buildOk = await vscode.commands.executeCommand<boolean | null>('het.getBuildOk');
  if (buildOk !== true) {
    const tail = (await vscode.commands.executeCommand<string>('het.getLastConanOutput')) ?? '';
    console.log('[real] conan output tail:\n' + tail.slice(-4000));
  }
  assert.strictEqual(buildOk, true, 'REAL conan create should succeed through the extension');

  const summary = (await vscode.commands.executeCommand('het.getTestSummary')) as
    | { passed: number; failed: number; skipped: number }
    | null;
  assert.ok(summary, 'gtest summary must be present');
  assert.ok(summary.passed > 0, 'at least one gtest case should pass');
  assert.strictEqual(summary.failed, 0, 'no gtest failures expected');

  // Linux: the managed lane runs coverage inside conan create (fixture keeps
  // activate_code_coverage=true on Linux) — the report must exist.
  if (process.platform === 'linux' && plan?.provider === 'linux-managed') {
    const proj = join(ext.extensionPath, 'out', 'real-proj');
    const covIndex = findUnder(proj, 'coverage_report', true);
    if (!covIndex) {
      const tail = (await vscode.commands.executeCommand<string>('het.getLastConanOutput')) ?? '';
      console.log('[real] coverage missing — conan output tail:\n' + tail.slice(-4000));
    }
    assert.ok(covIndex, 'Linux lane coverage_report/index.html must exist after the real build');
    console.log('[real] coverage report: ' + covIndex);
    const pct = readCoveragePct(covIndex.slice(0, covIndex.lastIndexOf('/')));
    console.log('[real] coverage lines pct ≈ ' + pct);
  }

  // Decision 3: docs through the real host on BOTH platforms. het.docs opens
  // the panel; het.docsRun drives the SAME runner headlessly (lane/native).
  console.log('[real] running het.docsRun (REAL docs build)…');
  const docsResult = (await vscode.commands.executeCommand('het.docsRun')) as { ok: boolean; message: string } | undefined;
  const projRoot = join(ext.extensionPath, 'out', 'real-proj');
  const doxHtml = findUnder(join(projRoot, 'docs', 'doxygen'), 'docs.html', true) ?? findUnder(join(projRoot, 'docs', 'doxygen'), 'index.html', true);
  const sphHtml = findUnder(join(projRoot, 'docs', 'sphinx'), 'index.html', true);
  console.log(`[real] docs result=${JSON.stringify(docsResult)} doxygen=${!!doxHtml} sphinx=${!!sphHtml}`);
  if (!docsResult || docsResult.ok !== true) {
    const tail = await vscode.commands
      .executeCommand<string>('het.getLastDocsOutput')
      .then((v) => v ?? '', () => '');
    console.log('[real] docs output tail:\n' + tail.slice(-3000));
  }
  assert.ok(docsResult && docsResult.ok === true, 'het.docs should succeed on the real host');
  assert.ok(doxHtml, 'doxygen artifact (docs.html) must exist after the real docs build');
  assert.ok(sphHtml, 'sphinx artifact (index.html) must exist after the real docs build');

  const evidence = `platform=${process.platform} provider=${plan!.provider} buildOk=${buildOk} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}\n`;
  writeFileSync(join(__dirname, '..', 'real-evidence.txt'), evidence, 'utf8');
  console.log('[real] PASS ' + evidence.trim());
  console.log(`[real] OK — REAL ${process.platform} build + tests + docs verified through the extension host`);
}
