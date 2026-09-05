import * as assert from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gcManagedEnv, managedLayout, removeManagedEnv, writeMarker } from '../core/managedEnv';
import {
  parseProjectToolchain,
  projectToolchainLabel,
  withProjectToolchain,
  TOOLCHAIN_MANAGED,
  TOOLCHAIN_SYSTEM,
} from '../core/projectToolchain';

const fakeRoot = join(tmpdir(), 'het-projtoolchain-test');

function freshRoot(): string {
  removeManagedEnv(managedLayout(fakeRoot));
  return fakeRoot;
}

describe('V4-8 projectToolchain (metadata semantics)', () => {
  it('parses managed / system / absent / invalid', () => {
    assert.strictEqual(parseProjectToolchain('{"name":"a","toolchain":"managed"}'), 'managed');
    assert.strictEqual(parseProjectToolchain('{"toolchain":"system"}'), 'system');
    assert.strictEqual(parseProjectToolchain('{"name":"a"}'), undefined);
    assert.strictEqual(parseProjectToolchain('{"toolchain":"weird"}'), undefined);
    assert.strictEqual(parseProjectToolchain('not json'), undefined);
  });

  it('withProjectToolchain sets the field and preserves the rest, pretty printed', () => {
    const out = withProjectToolchain('{"name":"mylib","version":"0.1.0"}', TOOLCHAIN_SYSTEM);
    const meta = JSON.parse(out) as Record<string, string>;
    assert.strictEqual(meta.name, 'mylib');
    assert.strictEqual(meta.version, '0.1.0');
    assert.strictEqual(meta.toolchain, TOOLCHAIN_SYSTEM);
    assert.ok(out.includes('\n  '), 'pretty printed');
  });

  it('labels are honest', () => {
    assert.ok(projectToolchainLabel('managed').includes('托管'));
    assert.ok(projectToolchainLabel('system').includes('本机'));
    assert.ok(projectToolchainLabel(undefined).includes('未声明'));
  });

  it('constants match the plan vocabulary', () => {
    assert.strictEqual(TOOLCHAIN_MANAGED, 'managed');
    assert.strictEqual(TOOLCHAIN_SYSTEM, 'system');
  });
});

describe('V4-8 gcManagedEnv (activation GC decisions)', () => {
  it('no env dir → keep', () => {
    freshRoot();
    const l = managedLayout(join(fakeRoot, 'x')); // does not exist
    assert.strictEqual(gcManagedEnv(l).action, 'keep');
  });

  it('tools attempt present → keep (retryable)', () => {
    const l = managedLayout(freshRoot());
    writeMarker(l, { version: 1, state: 'provisioning', provider: 'managed', createdAt: 1, updatedAt: 1, tools: {} });
    mkdirSync(join(l.toolsDir, 'py', 'bin'), { recursive: true });
    writeFileSync(join(l.toolsDir, 'py', 'bin', 'python'), '');
    assert.strictEqual(gcManagedEnv(l).action, 'keep');
  });

  it('pure stray files without marker/tools → remove', () => {
    const l = managedLayout(freshRoot());
    mkdirSync(l.envRoot, { recursive: true });
    writeFileSync(join(l.envRoot, 'provision.log'), 'aborted\n');
    assert.strictEqual(gcManagedEnv(l).action, 'remove');
  });
});

