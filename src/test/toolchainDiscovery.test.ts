import * as assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverTools, parseWslSnapshot, envRootCandidates } from '../core/toolchainDiscovery';

const fakeRoot = join(tmpdir(), 'het-toolchain-test');

function fakeConda(): string {
  rmSync(fakeRoot, { recursive: true, force: true });
  const envs = [
    join(fakeRoot, 'envs', 'build', 'Scripts'),
    join(fakeRoot, 'envs', 'base', 'Library', 'bin'),
    join(fakeRoot, 'envs', 'zzz', 'Scripts'),
  ];
  for (const d of envs) {
    mkdirSync(d, { recursive: true });
  }
  writeFileSync(join(fakeRoot, 'envs', 'build', 'Scripts', 'doxygen.exe'), '');
  writeFileSync(join(fakeRoot, 'envs', 'build', 'python.exe'), '');
  writeFileSync(join(fakeRoot, 'envs', 'base', 'Library', 'bin', 'dot.exe'), '');
  writeFileSync(join(fakeRoot, 'envs', 'zzz', 'Scripts', 'gitleaks.exe'), '');
  return fakeRoot;
}

describe('toolchainDiscovery (generic environment sniffing)', () => {
  after(() => rmSync(fakeRoot, { recursive: true, force: true }));

  it('parseWslSnapshot extracts tool=path lines and ignores none', () => {
    const m = parseWslSnapshot('gcc=/usr/bin/gcc\ng++=/usr/bin/g++\nlcov=none\ncmake=/usr/bin/cmake\n');
    assert.strictEqual(m['gcc'], '/usr/bin/gcc');
    assert.strictEqual(m['g++'], '/usr/bin/g++');
    assert.strictEqual(m['cmake'], '/usr/bin/cmake');
    assert.strictEqual(m['lcov'], undefined);
  });

  it('prefers the semantic env name (build) over other envs (hermetic: fake roots only)', async () => {
    const root = fakeConda();
    const rows = await discoverTools({ rootCandidates: [root], wsl: false, skipPath: true, preferEnvNames: ['build', 'base'] });
    const dox = rows.find((r) => r.key === 'doxygen');
    assert.ok(dox && dox.source === 'conda' && dox.sourceDetail.includes('env build'), JSON.stringify(dox));
    const gl = rows.find((r) => r.key === 'gitleaks');
    // gitleaks only exists in the fake zzz env → scanned after build/base
    assert.ok(gl && gl.source === 'conda' && gl.sourceDetail.includes('env zzz'), JSON.stringify(gl));
  });

  it('honors manual overrides and marks the row overridden', async () => {
    const rows = await discoverTools({ overrides: { doxygen: 'C:/manual/doxygen.exe' }, wsl: false });
    const dox = rows.find((r) => r.key === 'doxygen');
    assert.ok(dox);
    assert.strictEqual(dox.source, 'override');
    assert.strictEqual(dox.overridden, true);
    assert.strictEqual(dox.exe, 'C:/manual/doxygen.exe');
  });

  it('reports a missing tool honestly instead of guessing (hermetic: no env roots)', async () => {
    const empty = join(tmpdir(), 'het-roots-empty');
    const rows = await discoverTools({ rootCandidates: [empty], wsl: false, extraBinDirs: [], skipPath: true });
    const row = rows.find((r) => r.key === 'gcovr');
    assert.ok(row);
    assert.strictEqual(row.source, 'missing', 'with no real envs/PATH a niche tool is deterministically missing');
  });

  it('finds python at the env ROOT (conda keeps python.exe at the root, not Scripts)', async () => {
    const root = fakeConda();
    const rows = await discoverTools({ rootCandidates: [root], wsl: false, skipPath: true, preferEnvNames: ['build'] });
    const py = rows.find((r) => r.key === 'python');
    assert.ok(py && py.source === 'conda' && py.sourceDetail.includes('env build'), JSON.stringify(py));
  });

  it('tags gtest as conan-managed and lcov as optional-Linux when missing (hermetic)', async () => {
    const empty = join(tmpdir(), 'het-roots-empty2');
    const rows = await discoverTools({ rootCandidates: [empty], wsl: false, skipPath: true, extraBinDirs: [] });
    const gtest = rows.find((r) => r.key === 'gtest');
    const lcov = rows.find((r) => r.key === 'lcov');
    assert.ok(gtest && gtest.source === 'missing', 'gtest must be missing with no toolchain around');
    assert.strictEqual(gtest.managed, true, 'gtest must be flagged conan-managed');
    assert.ok(lcov && lcov.source === 'missing');
    assert.strictEqual(lcov.optional, true);
  });

  it('env root candidates include mamba roots and ProgramData', () => {
    const roots = envRootCandidates().map((r) => r.root.toLowerCase());
    assert.ok(roots.some((r) => r.includes('miniforge3')));
    assert.ok(roots.some((r) => r.includes('programdata')));
  });
});
