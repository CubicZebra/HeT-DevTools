import * as assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hasPair, planModuleFiles } from '../core/moduleTemplate';

describe('moduleTemplate.planModuleFiles', () => {
  it('generates a valid C++ header/source pair', () => {
    const plan = planModuleFiles({ moduleName: 'mymod', description: '向量运算', language: 'cpp', since: '1.0' });
    assert.strictEqual(plan.ok, true);
    assert.deepStrictEqual(
      plan.files.map((f) => f.relPath),
      ['include/mymod.hpp', 'src/mymod.cpp'],
    );
    const header = plan.files[0].content;
    const source = plan.files[1].content;
    assert.ok(header.includes('// Conan::ImportStart'));
    assert.ok(header.includes('// Conan::ImportEnd'));
    assert.ok(header.includes('#pragma once'));
    assert.ok(header.includes('@brief [en] 向量运算'));
    assert.ok(header.includes('@brief [zh] 向量运算'));
    assert.ok(header.includes('@since 1.0'));
    assert.ok(header.includes('@exporter'));
    assert.ok(header.includes('void mymod_init(void);'));
    assert.ok(source.includes('#include <mymod.hpp>'));
    assert.ok(source.includes('// TODO: implement'));
  });

  it('uses .h/.c for the C language', () => {
    const plan = planModuleFiles({ moduleName: 'cmod', description: 'C API', language: 'c', since: '1.0' });
    assert.strictEqual(plan.ok, true);
    assert.deepStrictEqual(
      plan.files.map((f) => f.relPath),
      ['include/cmod.h', 'src/cmod.c'],
    );
    assert.ok(!plan.files[0].content.includes('stdint'));
  });

  it('keeps extra declarations in the header after the init block', () => {
    const plan = planModuleFiles({
      moduleName: 'mymod',
      description: 'demo',
      language: 'cpp',
      since: '1.0',
      extraDeclarations: ['int mymod_sum(const int* a, int n);', '#include <evil> // ignored'],
    });
    assert.strictEqual(plan.ok, true);
    const header = plan.files[0].content;
    assert.ok(header.includes('int mymod_sum(const int* a, int n);'));
    assert.ok(!header.includes('evil'));
  });

  it('rejects invalid names and empty descriptions', () => {
    assert.strictEqual(planModuleFiles({ moduleName: 'MyMod', description: 'x', language: 'cpp', since: '' }).ok, false);
    assert.strictEqual(planModuleFiles({ moduleName: '9mod', description: 'x', language: 'cpp', since: '' }).ok, false);
    assert.strictEqual(planModuleFiles({ moduleName: 'okmod', description: '  ', language: 'cpp', since: '' }).ok, false);
  });

  it('hasPair detects existing files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'het-mod-'));
    try {
      assert.strictEqual(await hasPair(root, 'mymod'), false);
      writeFileSync(join(root, 'include-marker'), 'x');
      // simulate via real path creation
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, 'src', 'mymod.cpp'), '');
      assert.strictEqual(await hasPair(root, 'mymod'), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
