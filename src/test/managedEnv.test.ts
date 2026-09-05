import * as assert from 'node:assert';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  envWithManaged,
  managedLayout,
  managedProfile,
  markerState,
  readMarker,
  removeManagedEnv,
  requiredReadyFiles,
  venvBinDir,
  venvTool,
  writeMarker,
} from '../core/managedEnv';
import { currentManagedStatus, managedPrepare } from '../features/env/managedProvisioner';

const fakeRoot = join(tmpdir(), 'het-managedenv-test');

function freshStorage(): string {
  removeManagedEnv(managedLayout(fakeRoot));
  return fakeRoot;
}

describe('V4-2 managedEnv (managed storage layout/state/profiles)', () => {
  it('layout is fully inside the storage root (uninstall deletes everything)', () => {
    const l = managedLayout('C:/storage');
    assert.ok(l.envRoot.replace(/\\/g, '/').startsWith('C:/storage'));
    assert.ok(l.conanHome.startsWith(l.envRoot), 'CONAN_HOME must be under envRoot');
    assert.ok(l.markerPath.endsWith('.het-managed.json'));
    assert.strictEqual(l.envRoot, join('C:/storage', 'managed-env'));
  });

  it('marker round-trip and markerState', () => {
    const l = managedLayout(freshStorage());
    writeMarker(l, { version: 1, state: 'ready', provider: 'win-wsl2', createdAt: 1, updatedAt: 1, tools: { conan: '2.9' } });
    const m = readMarker(l);
    assert.ok(m);
    assert.strictEqual(m!.state, 'ready');
    assert.strictEqual(m!.provider, 'win-wsl2');
    assert.strictEqual(markerState(m), 'ready');
    assert.strictEqual(markerState(readMarker(managedLayout(join(fakeRoot, 'other')))), 'absent');
  });

  it('removeManagedEnv clears the whole tree', () => {
    const l = managedLayout(freshStorage());
    writeMarker(l, { version: 1, state: 'ready', provider: 'linux-native', createdAt: 1, updatedAt: 1, tools: {} });
    mkdirSync(join(l.conanHome, 'p'), { recursive: true });
    assert.ok(existsSync(l.markerPath));
    removeManagedEnv(l);
    assert.ok(!existsSync(l.envRoot));
  });

  it('envWithManaged puts venv bin first and sets CONAN_HOME', () => {
    const l = managedLayout('C:/s');
    const win = envWithManaged(l, true, 'C:/a;C:/b');
    const winDirs = win.PATH!.split(';');
    assert.strictEqual(winDirs[0], venvBinDir(l, true), 'managed venv Scripts must be first');
    assert.strictEqual(win.CONAN_HOME, l.conanHome);
    const l2 = managedLayout('/s');
    const posix = envWithManaged(l2, false, '/usr/bin:/bin');
    assert.strictEqual(posix.PATH!.split(':')[0], venvBinDir(l2, false));
    assert.strictEqual(posix.CONAN_HOME, l2.conanHome);
  });

  it('venv tool paths are platform aware', () => {
    const l = managedLayout('C:/s');
    assert.strictEqual(venvTool(l, true, 'conan').split(/[\\/]/).pop(), 'conan.exe');
    assert.strictEqual(venvTool(l, false, 'conan').split(/[\\/]/).pop(), 'conan');
    assert.strictEqual(venvBinDir(l, false).split(/[\\/]/).pop(), 'bin');
    assert.strictEqual(venvBinDir(l, true).split(/[\\/]/).pop(), 'Scripts');
  });

  it('managedProfile emits gcc settings + pinned CC/CXX env', () => {
    const p = managedProfile({ cc: '/opt/gcc/bin/gcc', cxx: '/opt/gcc/bin/g++', version: '13.2', libcxx: 'libstdc++11' }, 'Linux', 'x86_64', 'Debug');
    assert.ok(p.includes('compiler=gcc'));
    assert.ok(p.includes('compiler.version=13.2'));
    assert.ok(p.includes('CC=/opt/gcc/bin/gcc'));
    assert.ok(p.includes('CXX=/opt/gcc/bin/g++'));
    assert.ok(!p.includes('detect'));
  });

  it('managedProfile uses apple-clang on macOS', () => {
    const p = managedProfile({ cc: 'clang', cxx: 'clang++', version: '16', libcxx: 'libc++' }, 'Macos', 'arm64', 'Release');
    assert.ok(p.includes('compiler=apple-clang'));
    assert.ok(p.includes('compiler.libcxx=libc++'));
  });

  it('requiredReadyFiles = marker + CONAN_HOME marker + venv tools', () => {
    const l = managedLayout('C:/s');
    const files = requiredReadyFiles(l, true);
    assert.strictEqual(files.length, 6);
    assert.ok(files.includes(l.markerPath));
    assert.ok(files.some((f) => f.includes('.conan_home_marker')));
    assert.ok(files.some((f) => f.endsWith('conan.exe')));
  });
});

describe('V4-2 managedProvisioner (consent + status, no real installs)', () => {
  it('status on a fresh storage is absent', () => {
    const st = currentManagedStatus(freshStorage(), true);
    assert.strictEqual(st.state, 'absent');
  });

  it('prepare without consent refuses and does NOT touch disk', async () => {
    const storage = freshStorage();
    const r = await managedPrepare({ storageRoot: storage, isWin: true, basePath: 'C:/x', yes: false });
    assert.strictEqual(r.ok, false);
    assert.ok(r.message.includes('同意'));
    assert.ok(!existsSync(managedLayout(storage).envRoot), 'must not create anything before consent');
  });

  it('status reports error when marker says ready but files are gone', () => {
    const storage = freshStorage();
    const l = managedLayout(storage);
    writeMarker(l, { version: 1, state: 'ready', provider: 'linux-native', createdAt: 1, updatedAt: 1, tools: { conan: '2.9' } });
    const st = currentManagedStatus(storage, true);
    assert.strictEqual(st.state, 'error');
    assert.ok((st.note ?? '').includes('损坏'));
  });

  it('remove cleans a tree created by the test', () => {
    const storage = freshStorage();
    const l = managedLayout(storage);
    writeMarker(l, { version: 1, state: 'ready', provider: 'linux-native', createdAt: 1, updatedAt: 1, tools: {} });
    assert.ok(existsSync(l.markerPath));
    // provisioner.removeManagedEnv is core-managed; status after delete = absent
    removeManagedEnv(l);
    assert.strictEqual(currentManagedStatus(storage, true).state, 'absent');
  });
});
