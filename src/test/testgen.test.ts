import * as assert from 'node:assert';
import { paramKind, scanDocBlocks, scanHeader, renderTestFile, defaultValue } from '../core/testgen';

describe('testgen.scanHeader', () => {
  it('finds @exporter functions and their params', () => {
    const header = `// Conan::ImportStart
#pragma once
// Conan::ImportEnd

/**
 * @brief [en] sum
 * @brief [zh] 求和
 * @since 1.0
 * @exporter
 */
int mymod_sum(const int* a, int n);

/**
 * @brief [zh] 初始化
 * @since 1.0
 * @exporter
 */
void mymod_init(void);
`;
    const apis = scanHeader(header);
    assert.strictEqual(apis.length, 2);
    const sum = apis.find((a) => a.name === 'mymod_sum');
    assert.ok(sum);
    assert.deepStrictEqual(sum.paramTypes, ['int*', 'int']);
    const init = apis.find((a) => a.name === 'mymod_init');
    assert.ok(init);
    assert.deepStrictEqual(init.paramTypes, []);
  });

  it('ignores non-exporter doc blocks and templates/assignments', () => {
    const header = `/**
 * @brief internal helper (no exporter)
 */
int hidden(int x);

/** @brief keep me @exporter */
void keep_me(void);
`;
    const apis = scanHeader(header);
    assert.strictEqual(apis.length, 1);
    assert.strictEqual(apis[0].name, 'keep_me');
  });

  it('classifies param kinds and defaults', () => {
    assert.strictEqual(paramKind('int'), 'int');
    assert.strictEqual(paramKind('uint32_t'), 'uint');
    assert.strictEqual(paramKind('float'), 'float');
    assert.strictEqual(paramKind('const char*'), 'cstring');
    assert.strictEqual(paramKind('double *'), 'pointer');
    assert.strictEqual(paramKind('std::vector<int>'), 'unknown');
    assert.strictEqual(defaultValue('pointer'), 'nullptr');
    assert.strictEqual(defaultValue('uint'), '0u');
    assert.strictEqual(defaultValue('bool'), 'false');
  });
});

describe('testgen.renderTestFile', () => {
  it('emits positive/boundary/negative for every public API', () => {
    const header = `/**
 * @exporter
 */
void mymod_init(void);

/**
 * @exporter
 */
int mymod_scale(int x);
`;
    const apis = scanHeader(header);
    const out = renderTestFile('mymod', 'mymod.hpp', apis);
    assert.ok(out.includes('#include <gtest/gtest.h>'));
    assert.ok(out.includes('#include <mymod.hpp>'));
    assert.ok(out.includes('TEST(Mymod, mymod_init_positive)'));
    assert.ok(out.includes('ASSERT_NO_THROW(mymod_init());'));
    assert.ok(out.includes('TEST(Mymod, mymod_scale_positive)'));
    assert.ok(out.includes('mymod_scale(0)'));
    assert.ok(out.includes('mymod_scale_boundary'));
    assert.ok(out.includes('mymod_scale_negative'));
    assert.ok(!out.includes('mymod_init();mymod_init'));
  });

  it('separates global TEST objects by two blank lines', () => {
    const header = `/** @exporter */\nvoid a(void);\n/** @exporter */\nvoid b(void);\n`;
    const out = renderTestFile('mymod', 'mymod.hpp', scanHeader(header));
    const blocks = out.split('\n\n\n');
    assert.ok(blocks.length >= 5, 'cases separated by two blank lines');
  });
});

describe('testgen.scanDocBlocks', () => {
  it('returns doc + following code slice', () => {
    const blocks = scanDocBlocks(`/** @exporter */\nint f(int a);\n`);
    assert.strictEqual(blocks.length, 1);
    assert.ok(blocks[0].code.startsWith('int f(int a);'));
  });
});
