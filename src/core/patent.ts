/**
 * Patent mining helper (development-plan T-4.4 / G-20, optional).
 * Pure logic — no VS Code imports. Produces a search query and a Chinese
 * invention-disclosure draft (written under <root>/workspace/).
 */

export interface PatentInput {
  title: string;
  /** Field / domain, e.g. "嵌入式神经网络算子". */
  domain: string;
  /** The core problem being solved. */
  problem: string;
  /** Technical solution bullet lines. */
  solutionPoints: string[];
  /** What is new vs prior art. */
  novelty: string;
}

/** Build a compact patent search query from the disclosure input. */
export function renderSearchQuery(i: PatentInput): string {
  const terms = [i.domain, ...i.solutionPoints.map((p) => p.split(/[，。；、,.;:：]/)[0] ?? p)].filter((t) => t.trim().length > 0).slice(0, 8);
  const cn = terms.join(' AND ');
  const en = [i.title, i.domain].filter(Boolean).join(' ');
  return `# 检索式（可分别用于 智慧芽 / 佰腾 / Google Patents）\n中文：(${cn})\n英文：(${en} OR ${i.title}) AND (patent)\n`;
}

/** Render an invention-disclosure draft Markdown document. */
export function renderTechDisclosure(i: PatentInput): string {
  const points = i.solutionPoints.map((p, idx) => `${idx + 1}. ${p}`).join('\n');
  return `# 技术交底书（草稿）— ${i.title}

> 生成：HeT DevTools · het-patent（G-20 草稿，需人工复核后交专利代理人）
> 领域：${i.domain}

## 1. 技术问题

${i.problem}

## 2. 现有技术及其不足

（待补充：检索后填写最接近的现有技术，说明为何不足以解决上述问题。）

## 3. 技术方案

${points}

## 4. 与现有技术的区别（创新点）

${i.novelty}

## 5. 关键技术特征（用于权利要求草拟）

${i.solutionPoints.map((p, idx) => `- 特征 ${idx + 1}：${p}`).join('\n')}

## 6. 有益效果

（待补充：量化指标、性能/成本/可维护性收益。）

## 7. 检索记录

（把 ${'`'}renderSearchQuery${'`'} 检索式的结果粘贴于此。）
`;
}
