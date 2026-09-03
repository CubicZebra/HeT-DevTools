import * as assert from 'node:assert';
import { renderSearchQuery, renderTechDisclosure, PatentInput } from '../core/patent';

const input: PatentInput = {
  title: '嵌入式神经网络算子融合调度方法',
  domain: '嵌入式神经网络算子',
  problem: '算子逐个执行访存开销大。',
  solutionPoints: ['按数据依赖做算子融合分组', '对融合组做单次内存规划'],
  novelty: '融合分组考虑片上内存约束。',
};

describe('patent.renderSearchQuery', () => {
  it('builds Chinese AND query and English fallback', () => {
    const q = renderSearchQuery(input);
    assert.ok(q.includes('中文：('));
    assert.ok(q.includes('嵌入式神经网络算子'));
    assert.ok(q.includes('AND'));
    assert.ok(q.includes('英文：('));
  });
});

describe('patent.renderTechDisclosure', () => {
  it('renders the required sections', () => {
    const md = renderTechDisclosure(input);
    for (const h of ['# 技术交底书（草稿）— 嵌入式神经网络算子融合调度方法', '## 1. 技术问题', '## 2. 现有技术及其不足', '## 3. 技术方案', '## 4. 与现有技术的区别（创新点）', '## 7. 检索记录']) {
      assert.ok(md.includes(h), `missing ${h}`);
    }
    assert.ok(md.includes('1. 按数据依赖做算子融合分组'));
    assert.ok(md.includes('特征 1'));
  });
});
