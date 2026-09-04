/**
 * Zero-manual verification of the INSTALLED het-devtools vsix (GUI v3).
 *
 * Runs inside a downloaded, isolated VS Code whose extensions dir contains the
 * packaged vsix. No dialogs, no manual clicking. Each key step pauses ~1 s
 * (HET_VERIFY_HOLD_MS) so a human watching the window can follow along.
 *
 * Phase "empty": no project → chip must be HIDDEN (monitoring-only, V3-1);
 *   Explorer right-click channel `het.newProjectHere` creates a project in a
 *   folder with ZERO dialogs (auto-openFolder skipped inside the test host).
 * Phase "proj":  project workspace → chip (het.chipOverview, icon tooltip,
 *   no new-project link); dashboard deps section focus.
 * Phase "scrub": plain PowerShell PATH (no conda) → conan env sniffed,
 *   python not a false negative, gtest conan-managed, real `conan create`.
 */
import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const HET = 'het-fti.het-devtools';
const phase = process.env.HET_VERIFY_PHASE ?? 'empty';
const PROJ = process.env.HET_VERIFY_DEST ?? '';

/** Pause so a human watching the window can follow (~1 s). */
async function hold(): Promise<void> {
  const ms = Number(process.env.HET_VERIFY_HOLD_MS ?? 1000);
  if (ms > 0) {
    await new Promise((r) => setTimeout(r, ms));
  }
}

// Heartbeat watchdog: if the host makes no progress for `watchdogMs` the run
// is stuck (a stray notification/focus trap/etc.) — force-exit so the outer
// harness can retry instead of leaving a window open forever.
let lastBeat = Date.now();
function beat(): void {
  lastBeat = Date.now();
}
function log(m: string): void {
  console.log(m);
  beat();
}
const watchdogMs = Number(process.env.HET_VERIFY_WATCHDOG_MS ?? 60_000);
// A real `conan create` in the scrub phase legitimately takes minutes; widen
// the kill threshold while a build is in flight.
let longOpUntil = 0;
setInterval(() => {
  const now = Date.now();
  const limit = now < longOpUntil ? 10 * 60_000 : watchdogMs;
  if (now - lastBeat > limit) {
    console.error(`[verify-installed] WATCHDOG: no progress for ${Math.round(limit / 1000)}s — force exiting host`);
    process.exit(1);
  }
}, 5000).unref();

interface RowShape {
  key: string;
  source: string;
  managed?: boolean;
  exe?: string;
}

export async function run(): Promise<void> {
  log(`[verify-installed] phase=${phase}`);
  const ext = vscode.extensions.getExtension(HET);
  assert.ok(ext, 'installed het-devtools must be discovered');
  log('[verify-installed] activating installed het extension…');
  await ext.activate();
  log('[verify-installed] installed extension activated');
  await new Promise((r) => setTimeout(r, 400));

  if (phase === 'empty') {
    assert.ok(PROJ.length > 0, 'HET_VERIFY_DEST required');
    // V3-1: monitoring chip must be invisible without a project.
    const chip = (await vscode.commands.executeCommand('het.getChipState')) as unknown;
    assert.strictEqual(chip, null, 'chip must be hidden when no fcpp project is open');
    log('[verify-installed] empty-phase: chip hidden (monitoring only)');
    await hold();

    // V3-1/V3-2: Explorer right-click channel → zero-dialog init in the folder.
    await vscode.commands.executeCommand('het.newProjectHere', PROJ);
    await hold();
    const meta = JSON.parse(readFileSync(join(PROJ, 'metadata.json'), 'utf8')) as Record<string, unknown>;
    assert.strictEqual(meta.name, 'verify_proj', 'folder basename should become the project name');
    if (process.platform === 'win32') {
      assert.strictEqual(meta.activate_code_coverage, false, 'coverage must default off on Windows/MSVC');
    }
    assert.ok(existsSync(join(PROJ, '.het', 'template-ref.json')), 'marker written');
    assert.ok(existsSync(join(PROJ, 'include', 'cpptest.hpp')), 'template tree copied');
    log('[verify-installed] empty-phase OK — Explorer zero-op init on disk (no auto-open in host)');
  } else if (phase === 'proj') {
    assert.ok(PROJ.length > 0, 'HET_VERIFY_DEST required');
    const name = await vscode.commands.executeCommand<string | null>('het.getCurrentProject');
    assert.strictEqual(name, 'verify_proj', 'project workspace must detect verify_proj');
    const chip = (await vscode.commands.executeCommand('het.getChipState')) as { text: string; tooltip: string; command?: string } | null;
    assert.ok(chip, 'chip queryable');
    assert.strictEqual(chip.command, 'het.chipOverview', 'project chip opens the monitor overview');
    assert.ok(chip.tooltip.includes('$('), 'tooltip must carry $(icon) tokens');
    assert.ok(!chip.tooltip.includes('het.newProject'), 'monitoring chip must not offer new project');
    await vscode.commands.executeCommand('het.dashboard', ['deps']);
    await hold();
    const st = (await vscode.commands.executeCommand('het.getCockpitState')) as { page: string };
    assert.strictEqual(st.page, 'deps', 'dashboard deps section focused');
    log('[verify-installed] proj-phase OK — detect + chip overview + dashboard deps focus');
  } else if (phase === 'scrub') {
    assert.ok(PROJ.length > 0, 'HET_VERIFY_DEST required');
    assert.ok(!(process.env.PATH ?? '').toLowerCase().includes('miniforge'), 'test PATH must be scrubbed first');
    assert.ok(!(process.env.PATH ?? '').toLowerCase().includes('miniconda'), 'test PATH must be scrubbed first');
    const rt = (await vscode.commands.executeCommand('het.getConanRuntime')) as { exe?: string; envName?: string; version?: string } | null;
    assert.ok(rt && rt.exe && rt.envName, 'runtime must be sniffed with no conda on PATH: ' + JSON.stringify(rt));
    log('[verify-installed] sniffed conan: ' + rt.exe + ' (env ' + rt.envName + ', ' + (rt.version ?? '?') + ')');

    // V3-5: python must be found (no root-dir false negative); gtest conan-managed.
    const rows = (await vscode.commands.executeCommand('het.getEnvRows')) as RowShape[];
    const py = rows.find((r) => r.key === 'python');
    assert.ok(py && py.source !== 'missing', 'python must be found inside the sniffed env: ' + JSON.stringify(py));
    const gtest = rows.find((r) => r.key === 'gtest');
    assert.ok(gtest && (gtest.source !== 'missing' || gtest.managed), 'gtest must be found or conan-managed: ' + JSON.stringify(gtest));
    log('[verify-installed] env rows: python=' + (py?.source ?? '?') + ', gtest=' + (gtest?.source ?? '?'));

    // A real build legitimately takes minutes — widen the watchdog during it.
    longOpUntil = Date.now() + 10 * 60_000;
    await vscode.commands.executeCommand('het.build');
    await hold();
    const buildOk = await vscode.commands.executeCommand<boolean | null>('het.getBuildOk');
    longOpUntil = 0;
    if (buildOk !== true) {
      const tail = (await vscode.commands.executeCommand<string>('het.getLastConanOutput')) ?? '';
      log('[verify-installed] build output tail:\n' + tail.slice(-2000));
    }
    assert.strictEqual(buildOk, true, 'real conan build must succeed from a scrubbed PATH (conda sniffed)');
    log('[verify-installed] scrub-phase OK — sniffed conda env + real conan build green');
  } else {
    assert.fail('unknown phase ' + phase);
  }
  log('[verify-installed] OK');
}
