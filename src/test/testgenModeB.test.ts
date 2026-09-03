import * as assert from 'node:assert';
import {
  parseBlueprint,
  renderContractTest,
  renderImplementationPlan,
  ContractFn,
} from '../core/testgenModeB';

describe('testgenModeB.parseBlueprint', () => {
  it('parses function-style contract lines', () => {
    const p = parseBlueprint(
      `# mymod2 设计
功能：向量加法
- func mymod2_vec_add_f32(const float* a, const float* b, float* out, int n) -> int
- API mymod2_vec_sub_f32(const float* a, const float* b, float* out, int n) -> int
`,
    );
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.contracts.length, 2);
    const first = p.contracts[0];
    assert.strictEqual(first.name, 'mymod2_vec_add_f32');
    assert.deepStrictEqual(first.paramTypes, ['float*', 'float*', 'float*', 'int']);
    assert.strictEqual(first.returns, 'int');
  });

  it('parses PlantUML class methods into a suite', () => {
    const p = parseBlueprint(
      `@startuml
class ETL {
  + int vec_add(const float* a, const float* b, float* out, int n)
  + void reset()
}
@enduml
`,
    );
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.contracts.length, 2);
    for (const c of p.contracts) {
      assert.strictEqual(c.suite, 'ETL');
    }
  });

  it('reports issues when nothing is recognized', () => {
    const p = parseBlueprint('随便写的一句话，没有函数签名。\n第二行。\n');
    assert.strictEqual(p.ok, false);
    assert.ok(p.issues.length > 0);
  });
});

describe('testgenModeB.renderContractTest', () => {
  const contracts: ContractFn[] = [
    { suite: 'Mymod2', name: 'mymod2_reset', paramTypes: [], returns: 'void', line: 3 },
    { suite: 'Mymod2', name: 'mymod2_scale', paramTypes: ['int'], returns: 'int', line: 5 },
  ];
  it('emits contract cases referencing the module header', () => {
    const out = renderContractTest('mymod2', contracts, ['来自 PRD：数值模块']);
    assert.ok(out.includes('#include <mymod2.hpp>'));
    assert.ok(out.includes('TEST(Mymod2, mymod2_reset_positive_contract)'));
    assert.ok(out.includes('ASSERT_NO_THROW(mymod2_reset());'));
    assert.ok(out.includes('TEST(Mymod2, mymod2_scale_boundary_contract)'));
    assert.ok(out.includes('// 来自 PRD：数值模块'));
    assert.ok(out.includes('test-first'));
  });
});

describe('testgenModeB.renderImplementationPlan', () => {
  it('lists files, signatures and per-contract table', () => {
    const contracts: ContractFn[] = [
      { suite: 'Mymod2', name: 'mymod2_scale', paramTypes: ['int'], returns: 'int', line: 5 },
    ];
    const md = renderImplementationPlan('mymod2', 'src', contracts, '数值模块');
    assert.ok(md.includes('include/mymod2.hpp'));
    assert.ok(md.includes('src/mymod2.cpp'));
    assert.ok(md.includes('mymod2_scale'));
    assert.ok(md.includes('蓝图：「数值模块」'));
    assert.ok(md.includes('契约测试转绿'));
  });
});
