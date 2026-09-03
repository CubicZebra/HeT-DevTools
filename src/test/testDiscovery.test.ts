import * as assert from 'node:assert';
import { parseTestDeclarations } from '../core/testDiscovery';

describe('testDiscovery.parseTestDeclarations', () => {
  it('finds TEST declarations with line numbers', () => {
    const src = `#include <gtest/gtest.h>

// 由 HeT DevTools 生成
TEST(Mymod, mymod_init_positive) {
    ASSERT_NO_THROW(mymod_init());
}


TEST(Mymod, mymod_init_negative) {
    GTEST_SKIP();
}`;
    const decls = parseTestDeclarations(src);
    assert.strictEqual(decls.length, 2);
    assert.deepStrictEqual(decls[0], { suite: 'Mymod', name: 'mymod_init_positive', line: 4 });
    assert.deepStrictEqual(decls[1], { suite: 'Mymod', name: 'mymod_init_negative', line: 9 });
  });

  it('ignores TEST_F / DISABLED and comments', () => {
    const src = `// TEST(Mymod, commented) {}
TEST_F(Foo, bar) {}
TEST(Mymod, keep) {}
`;
    const decls = parseTestDeclarations(src);
    assert.strictEqual(decls.length, 1);
    assert.strictEqual(decls[0].name, 'keep');
  });

  it('handles empty source', () => {
    assert.deepStrictEqual(parseTestDeclarations(''), []);
  });
});
