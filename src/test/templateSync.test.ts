import * as assert from 'node:assert';
import {
  encodeMarker,
  markerPath,
  parseCommitList,
  parseMarker,
  renderSyncPlan,
} from '../core/templateSync';

describe('templateSync.marker', () => {
  it('round-trips encode/parse', () => {
    const text = encodeMarker({ repo: 'https://github.com/HeT-FTI/fcpp', ref: 'abc123', label: '推荐 · 锁定 abc123' });
    const m = parseMarker(text);
    assert.ok(m);
    assert.strictEqual(m.repo, 'https://github.com/HeT-FTI/fcpp');
    assert.strictEqual(m.ref, 'abc123');
    assert.ok(markerPath().endsWith('.het/template-ref.json'));
  });
  it('returns null for garbage', () => {
    assert.strictEqual(parseMarker('not json'), null);
    assert.strictEqual(parseMarker('{"repo":1}'), null);
  });
});

describe('templateSync.parseCommitList', () => {
  it('splits short + subject per line', () => {
    const out = parseCommitList('a1b2c3d feat(x): one\nb2c3d4e fix: two\n');
    assert.deepStrictEqual(out, [
      { short: 'a1b2c3d', subject: 'feat(x): one' },
      { short: 'b2c3d4e', subject: 'fix: two' },
    ]);
  });
});

describe('templateSync.renderSyncPlan', () => {
  it('renders plan with commit table and no-auto-merge note', () => {
    const md = renderSyncPlan({
      projectName: 'myproj',
      repo: 'https://github.com/HeT-FTI/fcpp',
      fromRef: 'a',
      toRef: 'b',
      commits: [
        { short: 'aa1', subject: 'feat: docs' },
        { short: 'bb2', subject: 'fix: cmake' },
      ],
      localOnly: false,
    });
    assert.ok(md.includes('模板同步计划'));
    assert.ok(md.includes('绝不自动合入'));
    assert.ok(md.includes('| `aa1` | feat: docs |'));
    assert.ok(md.includes('落后 2 个提交'));
  });
});
