import * as assert from 'node:assert';
import {
  HostCapabilities,
  ProviderDecision,
  MIN_FREE_MB,
  parseFakeHost,
  providerLabel,
  resolveProviderDecision,
  TOOLCHAIN_MANIFEST,
} from '../core/provisionPlan';

function caps(over: Partial<HostCapabilities>): HostCapabilities {
  return {
    platform: 'linux',
    arch: 'x64',
    wslAvailable: false,
    wslDefaultReady: false,
    virtualizationEnabled: false,
    isAdmin: false,
    msvcAvailable: false,
    ...over,
  };
}

describe('V4-1 provisionPlan', () => {
  it('manifest pins canonical versions', () => {
    assert.strictEqual(typeof TOOLCHAIN_MANIFEST.gcc, 'string');
    assert.ok(TOOLCHAIN_MANIFEST.gcc.length > 0);
    assert.ok(TOOLCHAIN_MANIFEST.conan.startsWith('2'));
    assert.ok(TOOLCHAIN_MANIFEST.python.startsWith('3.1'));
  });

  it('linux → linux-native with full coverage', () => {
    const d = resolveProviderDecision(caps({ platform: 'linux' }));
    assert.strictEqual(d.provider, 'linux-native');
    assert.strictEqual(d.coverage, 'full');
    assert.ok(providerLabel('linux-native').includes('Linux'));
  });

  it('darwin → macos-native with full coverage', () => {
    const d = resolveProviderDecision(caps({ platform: 'darwin' }));
    assert.strictEqual(d.provider, 'macos-native');
    assert.strictEqual(d.coverage, 'full');
  });

  it('win32 + wsl ready → win-wsl2 (Linux-identical, full)', () => {
    const d = resolveProviderDecision(caps({ platform: 'win32', wslAvailable: true, wslDefaultReady: true, virtualizationEnabled: true }));
    assert.strictEqual(d.provider, 'win-wsl2');
    assert.strictEqual(d.coverage, 'full');
  });

  it('win32 + wsl present but no ready distro → win-wsl2-pending (guide, never silent mingw)', () => {
    const d = resolveProviderDecision(caps({ platform: 'win32', wslAvailable: true, wslDefaultReady: false }));
    assert.strictEqual(d.provider, 'win-wsl2-pending');
    assert.strictEqual(d.coverage, 'partial');
    assert.ok(d.note.includes('托管 distro'), 'note must guide creating the managed distro');
    assert.ok(!d.note.includes('MinGW'), 'no silent MinGW degradation when WSL exists');
  });

  it('win32 + no wsl → mingw when allowed (default), never auto-msvc', () => {
    const plain = resolveProviderDecision(caps({ platform: 'win32' }));
    assert.strictEqual(plain.provider, 'win-mingw');
    assert.strictEqual(plain.coverage, 'partial');
    // MSVC present must NOT switch provider — only an explicit override does.
    const withMsvc = resolveProviderDecision(caps({ platform: 'win32', msvcAvailable: true }));
    assert.strictEqual(withMsvc.provider, 'win-mingw');
    assert.ok(withMsvc.note.includes('MSVC'), 'note should mention the explicit compat mode');
  });

  it('allowMingw=false + no wsl → win-wsl-required with guidance (no lane)', () => {
    const d = resolveProviderDecision(caps({ platform: 'win32' }), { allowMingw: false });
    assert.strictEqual(d.provider, 'win-wsl-required');
    assert.strictEqual(d.coverage, 'none');
    assert.ok(d.note.includes('wsl --install'), 'guide to enable WSL');
    assert.ok(d.note.includes('het.env.allowMingw'), 'mention how to re-open the compat lane');
  });

  it('unsupported platform reported honestly', () => {
    const d = resolveProviderDecision(caps({ platform: 'freebsd' }));
    assert.strictEqual(d.provider, 'unsupported');
    assert.strictEqual(d.coverage, 'none');
  });

  it('low disk adds a provisioning warning note', () => {
    const low = resolveProviderDecision(caps({ platform: 'linux', diskFreeBytes: (MIN_FREE_MB - 1) * 1024 * 1024 }));
    assert.ok(low.note.includes('磁盘'), 'low-disk note expected');
    const ok = resolveProviderDecision(caps({ platform: 'linux', diskFreeBytes: MIN_FREE_MB * 1024 * 1024 }));
    assert.ok(!ok.note.includes('磁盘'), 'enough disk → no warning');
  });

  it('parseFakeHost accepts booleans/platform and ignores junk', () => {
    const f = parseFakeHost('{"platform":"win32","wslAvailable":true,"wslDefaultReady":true,"diskFreeBytes":1,"isAdmin":true,"junk":1}');
    assert.strictEqual(f.platform, 'win32');
    assert.strictEqual(f.wslAvailable, true);
    assert.strictEqual(f.diskFreeBytes, 1);
    assert.strictEqual((f as Record<string, unknown>).junk, undefined);
    assert.deepStrictEqual(parseFakeHost('not json'), {});
    assert.deepStrictEqual(parseFakeHost(''), {});
    assert.deepStrictEqual(parseFakeHost(undefined), {});
  });

  it('fake host drives the full matrix (win-noWSL / win-WSL2 / linux / macos)', () => {
    const mk = (json: string): ProviderDecision => resolveProviderDecision({
      ...caps({}),
      ...parseFakeHost(json),
    } as HostCapabilities);
    assert.strictEqual(mk('{"platform":"win32"}').provider, 'win-mingw');
    assert.strictEqual(mk('{"platform":"win32","wslAvailable":true,"wslDefaultReady":true}').provider, 'win-wsl2');
    assert.strictEqual(mk('{"platform":"linux"}').provider, 'linux-native');
    assert.strictEqual(mk('{"platform":"darwin"}').provider, 'macos-native');
  });
});
