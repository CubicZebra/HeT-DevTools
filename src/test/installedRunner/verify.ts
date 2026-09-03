/**
 * Zero-manual verification of the INSTALLED het-devtools vsix.
 *
 * Runs inside a downloaded, isolated VS Code whose extensions dir contains the
 * packaged vsix (installed by scripts/verify-installed.mjs). No dialogs, no
 * QuickPicks, no manual clicking — every flow is driven by host commands and
 * asserted from disk / state.
 *
 * Phase "empty" (workspace = empty folder):
 *   1. installed extension discovered + activated
 *   2. status-bar chip invites project creation (het.getChipState)
 *   3. offline new project via bundled assets/template (prefer local)
 *   4. offline new project via the DEFAULT pinned path (auto-fallback, no hang)
 * Phase "proj"  (workspace = the project created in phase empty):
 *   5. project detected; chip switches to dashboard mode
 *   6. dashboard singleton opens + deps section focus
 */
import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const HET = 'het-fti.het-devtools';
const phase = process.env.HET_VERIFY_PHASE ?? 'empty';
const PROJ = process.env.HET_VERIFY_DEST ?? '';

export async function run(): Promise<void> {
  console.log(`[verify-installed] phase=${phase}`);
  const ext = vscode.extensions.getExtension(HET);
  assert.ok(ext, 'installed het-devtools must be discovered');
  await ext.activate();
  await new Promise((r) => setTimeout(r, 400));

  if (phase === 'empty') {
    assert.ok(PROJ.length > 0, 'HET_VERIFY_DEST required');
    const chip = (await vscode.commands.executeCommand('het.getChipState')) as { text: string; command?: string } | null;
    assert.ok(chip, 'chip state queryable');
    assert.ok(chip.text.includes('新建 fcpp'), 'chip should invite project creation: ' + chip.text);

    // 3) fully offline: bundled assets/template, prefer local
    const r1 = (await vscode.commands.executeCommand('het.newProjectDirect', {
      name: 'verifylib',
      description: 'installed-vsix offline check',
      dest: PROJ,
      confirmed: true,
      prefer: 'local',
      metadataExtra: { build_type: 'Release', build_cppstd: '20' },
    })) as { ok: boolean; message: string };
    console.log('[verify-installed] local-init: ' + r1.message);
    assert.strictEqual(r1.ok, true, 'offline local init must succeed: ' + r1.message);
    assert.ok(r1.message.includes('内置模板'), 'must use the bundled assets/template: ' + r1.message);
    const meta = JSON.parse(readFileSync(join(PROJ, 'metadata.json'), 'utf8')) as Record<string, unknown>;
    assert.strictEqual(meta.name, 'verifylib');
    assert.strictEqual(meta.build_type, 'Release');
    assert.ok(existsSync(join(PROJ, '.het', 'template-ref.json')), 'marker written');
    assert.ok(existsSync(join(PROJ, 'include', 'cpptest.hpp')), 'template tree copied');

    // 4) the exact user flow: DEFAULT (pinned) with no network → auto-fallback
    const dest2 = PROJ + '-default';
    const t0 = Date.now();
    const r2 = (await vscode.commands.executeCommand('het.newProjectDirect', {
      name: 'verifylib2',
      dest: dest2,
      confirmed: true,
    })) as { ok: boolean; message: string };
    const elapsed = Date.now() - t0;
    console.log(`[verify-installed] default-init (${elapsed}ms): ${r2.message}`);
    assert.strictEqual(r2.ok, true, 'default pinned init must auto-fallback: ' + r2.message);
    assert.ok(existsSync(join(dest2, 'metadata.json')), 'default-init project on disk');
    console.log('[verify-installed] empty-phase OK — chip + offline bundled + default auto-fallback');
  } else {
    assert.ok(PROJ.length > 0, 'HET_VERIFY_DEST required');
    const name = await vscode.commands.executeCommand<string | null>('het.getCurrentProject');
    assert.strictEqual(name, 'verifylib', 'project workspace must detect verifylib');
    const chip = (await vscode.commands.executeCommand('het.getChipState')) as { text: string; command?: string } | null;
    assert.ok(chip, 'chip queryable');
    assert.strictEqual(chip.command, 'het.dashboard', 'project chip opens dashboard');
    await vscode.commands.executeCommand('het.dashboard', ['deps']);
    await new Promise((r) => setTimeout(r, 900));
    const st = (await vscode.commands.executeCommand('het.getCockpitState')) as { page: string };
    assert.strictEqual(st.page, 'deps', 'dashboard deps section focused');
    console.log('[verify-installed] proj-phase OK — detect + chip + dashboard deps focus');
  }
  console.log('[verify-installed] OK');
}
