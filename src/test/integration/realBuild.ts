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
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'het-test-publisher.het-devtools';

interface ProviderPlan {
  provider?: string;
  coverage?: string;
  reason?: string;
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

  const evidence = `platform=${process.platform} provider=${plan!.provider} buildOk=${buildOk} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}\n`;
  writeFileSync(join(__dirname, '..', 'real-evidence.txt'), evidence, 'utf8');
  console.log('[real] PASS ' + evidence.trim());
  console.log(`[real] OK — REAL ${process.platform} build + tests verified through the extension host`);
}
