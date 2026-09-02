import * as assert from 'node:assert';
import { normalizeLocale, t, translate } from '../utils/i18n';

describe('i18n', () => {
  it('normalizes locale variants', () => {
    assert.strictEqual(normalizeLocale('zh-cn'), 'zh');
    assert.strictEqual(normalizeLocale('zh'), 'zh');
    assert.strictEqual(normalizeLocale('en-US'), 'en');
    assert.strictEqual(normalizeLocale(undefined), 'en');
  });

  it('translates known keys', () => {
    assert.strictEqual(translate('zh', 'common.cancel'), '取消');
    assert.strictEqual(translate('en', 'common.cancel'), 'Cancel');
    assert.strictEqual(translate('zh', 'hello.title'), 'HeT DevTools 冒烟测试通过');
  });

  it('falls back to the key for unknown entries', () => {
    assert.strictEqual(t('zh', 'no.such.key'), 'no.such.key');
  });
});
