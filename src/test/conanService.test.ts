import * as assert from 'node:assert';
import { conanCreateArgs, locateConan, conanDefaultProfilePath } from '../core/conanService';

describe('conanService.conanDefaultProfilePath (P2 fresh-machine detect)', () => {
  it('defaults to ~/.conan2/profiles/default', () => {
    delete process.env.CONAN_HOME;
    const p = conanDefaultProfilePath().replace(/\\/g, '/');
    assert.ok(p.endsWith('/.conan2/profiles/default'), p);
  });

  it('honours CONAN_HOME when set', () => {
    const prev = process.env.CONAN_HOME;
    process.env.CONAN_HOME = '/custom/conan';
    try {
      const p = conanDefaultProfilePath().replace(/\\/g, '/');
      assert.ok(p.startsWith('/custom/conan/'), p);
      assert.ok(p.endsWith('/profiles/default'), p);
    } finally {
      if (prev === undefined) {
        delete process.env.CONAN_HOME;
      } else {
        process.env.CONAN_HOME = prev;
      }
    }
  });
});


describe('conanService.conanCreateArgs', () => {
  it('native Debug build with --build=missing (canonical form)', () => {
    assert.deepStrictEqual(conanCreateArgs(), [
      'create', '.', '-s', 'build_type=Debug', '--build=missing',
    ]);
  });

  it('Release build', () => {
    const args = conanCreateArgs({ buildType: 'Release' });
    assert.ok(args.includes('build_type=Release'));
  });

  it('cross-build adds host profile and disables test folder', () => {
    const args = conanCreateArgs({ profileHost: 'arm_profile', testFolder: '' });
    assert.ok(args.includes('-pr:b=default'));
    assert.ok(args.includes('-pr:h=arm_profile'));
    assert.ok(args.includes('-tf=""'));
  });

  it('appends extra -pr profile files', () => {
    const args = conanCreateArgs({ profiles: ['C:/dev/profile.txt'] });
    const idx = args.indexOf('-pr');
    assert.ok(idx >= 0);
    assert.strictEqual(args[idx + 1], 'C:/dev/profile.txt');
  });

  it('keeps test package when testFolder is null (default)', () => {
    const args = conanCreateArgs({ buildMissing: true });
    assert.ok(!args.some((a) => a.startsWith('-tf')));
  });
});

describe('conanService.locateConan', () => {
  it('never returns a non-existent override path', async () => {
    const bogus = 'C:/definitely/not/a/conan';
    const found = await locateConan({ conanPath: bogus, extraCandidates: [] });
    assert.notStrictEqual(found, bogus);
  });

  it('honors an explicit conanPath that exists', async () => {
    // node.exe certainly exists; used purely to prove override precedence.
    const node = process.execPath;
    const found = await locateConan({ conanPath: node });
    assert.strictEqual(found, node);
  });

  it('finds conan via PATH when available', async function () {
    const fromPath = await locateConan({});
    if (fromPath === null) {
      this.skip(); // conan not installed in this environment
      return;
    }
    assert.ok(fromPath.length > 0);
  });
});
