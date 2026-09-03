import * as assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverConanRuntime, runtimeFromExePath, defaultCondaRoots } from '../core/condaEnv';

const fakeRoot = join(tmpdir(), 'het-conda-test');

function fakeRootTree(): string {
  rmSync(fakeRoot, { recursive: true, force: true });
  const scripts = join(fakeRoot, 'envs', 'build', 'Scripts');
  const other = join(fakeRoot, 'envs', 'zzz', 'Scripts');
  const baseScripts = join(fakeRoot, 'Scripts');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(other, { recursive: true });
  mkdirSync(baseScripts, { recursive: true });
  writeFileSync(join(scripts, 'conan.exe'), '');
  writeFileSync(join(other, 'conan.exe'), '');
  writeFileSync(join(baseScripts, 'conan.exe'), '');
  return fakeRoot;
}

describe('condaEnv discovery (environment sniffing)', () => {
  it('prefers the `build` env and builds a PATH-emulating prefix', async () => {
    const root = fakeRootTree();
    const rt = await discoverConanRuntime({ roots: [root] });
    assert.ok(rt, 'must discover the fake root');
    assert.strictEqual(rt!.envName, 'build');
    assert.strictEqual(rt!.exe, join(root, 'envs', 'build', 'Scripts', 'conan.exe'));
    assert.ok(rt!.pathPrefix.includes('Scripts'), 'prefix must expose Scripts');
    assert.ok(rt!.pathPrefix.includes(join('envs', 'build')), 'prefix must include the env dir');
    assert.ok(rt!.pathPrefix.includes('condabin'), 'prefix must include condabin');
  });

  it('falls back to base, then any env, when build is absent', async () => {
    const root = fakeRootTree();
    rmSync(join(root, 'envs', 'build'), { recursive: true, force: true });
    const rt = await discoverConanRuntime({ roots: [root] });
    assert.ok(rt);
    assert.strictEqual(rt!.envName, 'base');
    const noBase = await discoverConanRuntime({ roots: [root], includeBase: false });
    assert.ok(noBase);
    assert.strictEqual(noBase!.envName, 'zzz');
  });

  it('returns null when no candidate root contains conan', async () => {
    const root = fakeRootTree();
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, 'envs'), { recursive: true });
    const rt = await discoverConanRuntime({ roots: [root] });
    assert.strictEqual(rt, null);
  });

  it('derives a runtime from an exe inside conda envs and base', () => {
    const env = runtimeFromExePath('C:/Users/me/miniforge3/envs/build/Scripts/conan.exe');
    assert.ok(env);
    assert.strictEqual(env!.envName, 'build');
    assert.strictEqual(env!.root, 'C:/Users/me/miniforge3');
    const base = runtimeFromExePath('C:/Users/me/miniforge3/Scripts/conan.exe');
    assert.ok(base);
    assert.strictEqual(base!.envName, 'base');
    assert.strictEqual(runtimeFromExePath('C:/tools/conan.exe'), undefined);
  });

  it('default roots cover the common Windows install locations', () => {
    const roots = defaultCondaRoots().map((r) => r.toLowerCase());
    for (const expect of ['miniforge3', 'miniconda3', 'anaconda3']) {
      assert.ok(roots.some((r) => r.includes(expect)), `missing root candidate ${expect}`);
    }
  });
});
