import * as assert from 'node:assert';
import { docsOptions, graphvizMismatch, normPath, artifactRoots } from '../core/docsService';

describe('docsService.docsOptions', () => {
  it('reads languages and versions from metadata', () => {
    const o = docsOptions({ doc_languages: ['en', 'zh'], doc_versions: ['1.0', '2.0'] });
    assert.deepStrictEqual(o.languages, ['en', 'zh']);
    assert.deepStrictEqual(o.versions, ['1.0', '2.0']);
  });
  it('handles missing keys', () => {
    const o = docsOptions({});
    assert.deepStrictEqual(o.languages, []);
    assert.deepStrictEqual(o.versions, []);
  });
});

describe('docsService.normPath', () => {
  it('normalizes slashes and trailing separators', () => {
    assert.strictEqual(normPath('C:\\Users\\dot\\bin\\', 'win32'), 'c:/users/dot/bin');
    assert.strictEqual(normPath('/usr/bin', 'linux'), '/usr/bin');
  });
});

describe('docsService.graphvizMismatch', () => {
  const win = 'win32';
  it('flags the POSIX template default on Windows', () => {
    const r = graphvizMismatch({ graphviz_bin: '/usr/bin' }, 'C:/Users/x/Library/bin/dot.exe', win);
    assert.strictEqual(r.mismatch, true);
    assert.ok(r.expected.includes('Library/bin'));
    assert.ok(r.reason.includes('机器相关'));
  });
  it('matches when equal', () => {
    const r = graphvizMismatch({ graphviz_bin: 'C:/Users/x/Library/bin' }, 'C:/Users/x/Library/bin/dot.exe', win);
    assert.strictEqual(r.mismatch, false);
  });
  it('reports neutral when dot missing or unset', () => {
    assert.strictEqual(graphvizMismatch({}, 'dot.exe', win).mismatch, false);
    assert.strictEqual(graphvizMismatch({ graphviz_bin: '/usr/bin' }, null, win).mismatch, false);
  });
});

describe('docsService.artifactRoots', () => {
  it('exposes sphinx and doxygen build dirs', () => {
    assert.deepStrictEqual(
      artifactRoots().map((a) => a.label),
      ['Sphinx', 'Doxygen'],
    );
  });
});
