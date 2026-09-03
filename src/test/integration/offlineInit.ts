import * as assert from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'het-fti.het-devtools';
const DEST = process.env.HET_OFFLINE_DEST ?? '';
const TPL = process.env.HET_TEMPLATE_LOCAL ?? '';

export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext);
  await ext.activate();
  assert.ok(DEST.length > 0 && TPL.length > 0, 'HET_OFFLINE_DEST + HET_TEMPLATE_LOCAL required');
  const r = (await vscode.commands.executeCommand('het.newProjectDirect', {
    name: 'offlib',
    description: 'offline bundled-template init check',
    dest: DEST,
    confirmed: true,
    prefer: 'local',
  })) as { ok: boolean; message: string };
  console.log('[offline-init] result: ' + r.message);
  assert.strictEqual(r.ok, true, 'offline bundled-template init must succeed');
  assert.ok(existsSync(join(DEST, 'metadata.json')), 'metadata.json must exist');
  assert.ok(existsSync(join(DEST, '.het', 'template-ref.json')), 'marker must exist');
  assert.ok(TPL.includes('assets'), 'must run against the bundled assets/template');
  console.log('[offline-init] OK — project created from bundled assets/template (' + TPL + ')');
}
