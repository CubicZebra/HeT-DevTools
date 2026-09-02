import * as assert from 'node:assert';
import { TEMPLATE_REF, TEMPLATE_REPO } from '../core/templateDefaults';
import {
  RemoteVersionData,
  resolveCloneRef,
  resolveTemplateSource,
} from '../core/templateService';

describe('templateService.resolveTemplateSource', () => {
  it('defaults to the maintainer-locked remote ref', () => {
    const src = resolveTemplateSource('');
    assert.strictEqual(src.mode, 'remote');
    assert.strictEqual(src.repo, TEMPLATE_REPO);
    assert.strictEqual(src.ref, TEMPLATE_REF);
  });

  it('local override switches to local mode (dev/offline only)', () => {
    const src = resolveTemplateSource('C:/dev/fcpp');
    assert.strictEqual(src.mode, 'local');
    assert.strictEqual(src.localPath, 'C:/dev/fcpp');
  });
});

describe('templateService.resolveCloneRef', () => {
  const remoteSrc = { mode: 'remote' as const, repo: TEMPLATE_REPO, ref: TEMPLATE_REF };
  const localSrc = { mode: 'local' as const, localPath: 'C:/dev/fcpp' };

  const remote: RemoteVersionData = {
    releases: [
      { tag: 'v0.2.0', prerelease: true },
      { tag: 'v0.1.0', prerelease: false },
    ],
    tags: ['v0.2.0', 'v0.1.0', 'v0.0.1'],
  };

  it('recommended → maintainer pin (tag or hash form)', () => {
    const d = resolveCloneRef(remoteSrc, 'recommended', remote);
    assert.strictEqual(d.cloneRef, TEMPLATE_REF);
    assert.strictEqual(d.isMain, false);
    assert.strictEqual(d.isLocal, false);
  });

  it('recommended with no pin → main (unpinned)', () => {
    const d = resolveCloneRef({ mode: 'remote', repo: TEMPLATE_REPO }, 'recommended', remote);
    assert.strictEqual(d.cloneRef, 'main');
    assert.strictEqual(d.isMain, true);
  });

  it('latest-release → newest stable release, prereleases skipped', () => {
    const d = resolveCloneRef(remoteSrc, 'latest-release', remote);
    assert.strictEqual(d.cloneRef, 'v0.1.0');
    assert.strictEqual(d.isMain, false);
  });

  it('latest-release without releases → newest tag', () => {
    const d = resolveCloneRef(remoteSrc, 'latest-release', { releases: [], tags: ['a', 'b'] });
    assert.strictEqual(d.cloneRef, 'a');
  });

  it('latest-release without any remote data → main fallback', () => {
    const d = resolveCloneRef(remoteSrc, 'latest-release');
    assert.strictEqual(d.cloneRef, 'main');
    assert.strictEqual(d.isMain, true);
  });

  it('main → track upstream main', () => {
    const d = resolveCloneRef(remoteSrc, 'main', remote);
    assert.strictEqual(d.cloneRef, 'main');
    assert.strictEqual(d.isMain, true);
  });

  it('local source → HEAD, flagged isLocal', () => {
    const d = resolveCloneRef(localSrc, 'recommended');
    assert.strictEqual(d.cloneRef, 'HEAD');
    assert.strictEqual(d.isLocal, true);
  });
});
