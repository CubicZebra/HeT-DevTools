import * as assert from 'node:assert';
import {
  WSL_CC,
  WSL_CXX,
  wslLaneBuildCommand,
  wslLaneEnsureCommand,
  wslLaneLayout,
  wslLaneProfile,
  wslOutToWin,
} from '../core/wslLane';

describe('V5-1 wslLane (WSL2 managed build lane pure helpers)', () => {
  it('keeps everything under ~/.het-fti/managed-env', () => {
    const l = wslLaneLayout('/home/chen');
    assert.strictEqual(l.root, '/home/chen/.het-fti/managed-env');
    assert.strictEqual(l.venv, '/home/chen/.het-fti/managed-env/venv');
    assert.strictEqual(l.conanHome, '/home/chen/.het-fti/managed-env/conan2');
    assert.strictEqual(l.profilesDir, '/home/chen/.het-fti/managed-env/conan2/profiles');
    assert.strictEqual(l.profile, '/home/chen/.het-fti/managed-env/conan2/profiles/default');
  });

  it('generates a pinned gcc 13 profile (never detected)', () => {
    const p = wslLaneProfile('Release');
    assert.ok(p.includes('[settings]'));
    assert.ok(p.includes('os=Linux'));
    assert.ok(p.includes('arch=x86_64'));
    assert.ok(p.includes('compiler=gcc'));
    assert.ok(p.includes('compiler.version=13'));
    assert.ok(p.includes('compiler.libcxx=libstdc++11'));
    assert.ok(p.includes('tools.build:compiler_executables'));
    assert.ok(p.includes(`"c": "${WSL_CC}"`));
    assert.ok(p.includes(`"cpp": "${WSL_CXX}"`));
  });

  it('ensure command is idempotent: venv + pip pin + profile heredoc + CONAN_HOME marker', () => {
    const c = wslLaneEnsureCommand('/home/chen', wslLaneProfile('Release'));
    assert.ok(c.includes('/home/chen/.het-fti/managed-env/conan2/profiles'));
    assert.ok(c.includes('"conan>=2.0,<3"'));
    assert.ok(c.includes('"cmake>=4.0,<5"'));
    assert.ok(c.includes('"ninja>=1.11"'));
    assert.ok(c.includes('HET_WSL_PROFILE'));
    assert.ok(c.includes('.conan_home_marker'));
    assert.ok(c.includes('lane_gcc'));
    assert.ok(c.includes('CONDA_PY'), 'conda python is a fallback candidate');
    // venv bootstrap only runs when conan is missing
    assert.ok(c.includes('[ ! -x '));
    // never touches the user's conda envs
    assert.ok(!c.includes('conda activate'));
    assert.ok(!c.includes('pip install --user'));
  });

  it('build command isolates PATH + CONAN_HOME and runs the canonical conan create', () => {
    const c = wslLaneBuildCommand('/mnt/c/proj/src', '/home/chen', 'Debug');
    assert.ok(c.includes('export PATH="/home/chen/.het-fti/managed-env/venv/bin:$PATH"'));
    assert.ok(c.includes('export CONAN_HOME="/home/chen/.het-fti/managed-env/conan2"'));
    assert.ok(c.includes('unset CONDA_PREFIX CONDA_DEFAULT_ENV'));
    assert.ok(c.includes('cd "/mnt/c/proj/src"'));
    assert.ok(c.includes('conan create . -s build_type=Debug --build=missing'));
  });

  it('wslOutToWin maps /mnt/<drive>/ back to Windows drive paths and leaves others', () => {
    assert.strictEqual(
      wslOutToWin('/mnt/c/Users/me/src/a.cpp:12:5: error: boom'),
      'C:/Users/me/src/a.cpp:12:5: error: boom',
    );
    assert.strictEqual(
      wslOutToWin('  /mnt/d/x.cc(3,1) : error C2065'),
      '  D:/x.cc(3,1) : error C2065',
    );
    assert.strictEqual(wslOutToWin('/home/chen/.conan2/p/x'), '/home/chen/.conan2/p/x');
    assert.strictEqual(wslOutToWin('src/etl.cpp:5: error: y'), 'src/etl.cpp:5: error: y');
  });
});
