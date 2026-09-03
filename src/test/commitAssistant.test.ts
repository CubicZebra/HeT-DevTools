import * as assert from 'node:assert';
import {
  composeHeader,
  defaultEmoji,
  parsePorcelain,
  suggestType,
  typeForPath,
  SwitchState,
} from '../core/commitAssistant';

describe('commitAssistant.parsePorcelain', () => {
  it('parses staged, unstaged, untracked', () => {
    const raw = 'M  include/a.hpp\n M src/b.cpp\n?? test_package/test/unit/new_test.cpp\nA  docs/x.md\n';
    const entries = parsePorcelain(raw);
    assert.strictEqual(entries.length, 4);
    assert.strictEqual(entries[0].path, 'include/a.hpp');
    assert.strictEqual(entries[0].staged, true);
    assert.strictEqual(entries[1].staged, false);
    assert.strictEqual(entries[2].status, 'untracked');
    assert.strictEqual(entries[2].staged, false);
    assert.strictEqual(entries[3].staged, true);
  });
});

describe('commitAssistant.typeForPath / suggestType', () => {
  it('maps paths to conventional types', () => {
    assert.strictEqual(typeForPath('test_package/test/unit/x_test.cpp'), 'test');
    assert.strictEqual(typeForPath('docs/sphinx/conf.py'), 'docs');
    assert.strictEqual(typeForPath('.github/workflows/ci.yml'), 'ci');
    assert.strictEqual(typeForPath('include/mymod.hpp'), 'feat');
    assert.strictEqual(typeForPath('metadata.json'), 'build');
    assert.strictEqual(typeForPath('README.md'), 'chore');
  });
  it('aggregates by strongest type', () => {
    assert.strictEqual(suggestType(['include/a.hpp', 'src/a.cpp', 'test_package/test/unit/a_test.cpp']), 'test');
    assert.strictEqual(suggestType(['docs/a.md', 'docs/b.md']), 'docs');
  });
});

describe('commitAssistant.defaultEmoji', () => {
  const state = (triggers: Record<string, boolean>): SwitchState => ({
    triggers,
    buildType: 'Debug',
    triggerTests: true,
  });
  it('returns :beer: for tests when tests pipeline on', () => {
    const e = defaultEmoji('test', state({ tests: true }));
    assert.ok(e && e.emoji === ':beer:');
  });
  it('returns null when the switch is off', () => {
    assert.strictEqual(defaultEmoji('test', state({ tests: false })), null);
    assert.strictEqual(defaultEmoji('docs', state({ docs: false })), null);
  });
  it('maps build/security/doc types to their triggers', () => {
    assert.strictEqual(defaultEmoji('build', state({ build: true }))?.id, 'build');
    assert.strictEqual(defaultEmoji('docs', state({ docs: true }))?.id, 'docs');
    assert.strictEqual(defaultEmoji('ci', state({ security_scan: true }))?.id, 'security');
  });
});

describe('commitAssistant.composeHeader', () => {
  it('composes canonical and minimal forms', () => {
    assert.strictEqual(composeHeader('test', ':beer:', false, 'vector add cases'), 'test(:beer:): vector add cases');
    assert.strictEqual(composeHeader('fix', null, false, 'null check'), 'fix: null check');
    assert.strictEqual(composeHeader('feat', ':fire:', true, 'breaking api'), 'feat(:fire:)!: breaking api');
  });
});
