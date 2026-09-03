/**
 * C6 cockpit/dashboard check (gui-rework-plan-v2 Checkpoint C6).
 *
 * Two phases, fully offline:
 *   Phase "empty" — an empty workspace folder → the status-bar chip becomes a
 *                   "＋ 新建 fcpp 项目" hint wired to the new-project wizard.
 *   Phase "proj"  — the mini-fcpp fixture → chip shows the project and opens
 *                   the dashboard; `het.dashboard?["deps"]` focuses the deps
 *                   section of the single-column document; the V2-3 search
 *                   command is registered.
 *
 * Run with:  npm run test:c6
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'het-fti.het-devtools';
const phase = process.env.HET_C6_PHASE ?? 'empty';

interface ChipShape {
  text: string;
  tooltip: string;
  command?: string;
}

export async function run(): Promise<void> {
  console.log(`[c6] phase=${phase} starting`);
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext, 'extension must be discovered');
  await ext.activate();
  await new Promise((r) => setTimeout(r, 400));

  const chip = (await vscode.commands.executeCommand('het.getChipState')) as ChipShape | null;
  assert.ok(chip, 'status-bar chip state must be queryable');

  if (phase === 'empty') {
    assert.ok(chip.text.includes('新建 fcpp'), 'empty workspace chip should invite project creation: ' + chip.text);
    assert.strictEqual(chip.command, 'het.newProject');
    assert.ok(chip.tooltip.includes('het.newProject'), 'tooltip must carry the new-project command link');
    console.log('[c6] empty-phase OK — chip invites project creation');
  } else {
    assert.ok(chip.text.includes('HeT'), 'project chip should be present');
    assert.strictEqual(chip.command, 'het.dashboard');
    assert.ok(chip.tooltip.includes('het.dashboard'), 'tooltip must link the dashboard');

    // open dashboard at the deps section (anchor semantics)
    await vscode.commands.executeCommand('het.dashboard', ['deps']);
    await new Promise((r) => setTimeout(r, 1200));
    const state = (await vscode.commands.executeCommand('het.getCockpitState')) as { page: string; top: { projectName: string } };
    assert.ok(state, 'cockpit state must be queryable');
    assert.strictEqual(state.top.projectName, 'mini-fcpp');
    assert.strictEqual(state.page, 'deps', 'dashboard should focus the deps section');

    // V2-3 search command is registered
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes('het.refreshConanIndex'), 'het.refreshConanIndex must be registered');
    assert.ok(cmds.includes('het.addDependency'), 'het.addDependency must be registered');
    console.log('[c6] project-phase OK — chip + dashboard deps focus + deps commands registered');
  }
  console.log('[c6] OK');
}
