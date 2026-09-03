/**
 * Audit report (development-plan T-4.3 / G-03 full).
 * Pure logic — no VS Code imports. Renders a comprehensive, chat-referenceable
 * Markdown report from facts the host collects (written to <root>/workspace/).
 */

import { HealthReport } from './healthCheck';

export interface AuditTool {
  name: string;
  ok: boolean;
}

export interface AuditWorkflow {
  file: string;
  name: string;
  on: string[];
}

export interface AuditInput {
  generatedAt: string;
  projectName: string;
  version: string;
  target: string;
  health: HealthReport;
  structure: { path: string; present: boolean }[];
  pairedModules: string[];
  metadataErrors: string[];
  tools: AuditTool[];
  build: { ok?: boolean; detail: string };
  tests: { passed?: number; failed?: number; skipped?: number; detail: string };
  docsArtifacts: string[];
  coverageReport: string | null;
  workflows: AuditWorkflow[];
  security: { gitleaks: boolean; megalinter: boolean; checkov: boolean };
  git: { branch: string; clean: boolean };
  quality: { formatOk?: boolean; commitlintOk?: boolean; tidyOk?: boolean };
}

const md = (s: string): string => s;

export function renderAuditMarkdown(i: AuditInput): string {
  const verdictIcon = i.health.verdict === 'PASS' ? '✅' : i.health.verdict === 'WARN' ? '⚠️' : '❌';
  const line = (row: { path: string; present: boolean }): string => `- [${row.present ? 'x' : ' '}] \`${md(row.path)}\``;

  const sections: string[] = [];
  sections.push(
    `# ${i.projectName} — 项目审计报告

> 生成：HeT DevTools · het-audit（G-03 完整版）· ${i.generatedAt}
> 可直接在 Copilot Chat 中引用本文件（\`@workspace audit-report.md\`）。

## 1. 概览

| 项 | 值 |
|----|----|
| 项目 | ${md(i.projectName)} |
| 版本 | ${md(i.version)} |
| 目标 | ${md(i.target)} |
| 健康分 | ${verdictIcon} ${i.health.score}/100（${i.health.verdict}） |
`,
  );

  sections.push(`## 2. 健康评分明细

| 规则 | 状态 | 说明 |
|------|------|------|
${i.health.checks
  .map(
    (c) =>
      `| ${md(c.title)} | ${c.kind === 'ok' ? '✅' : c.kind === 'warn' ? '⚠️' : '❌'} | ${md(c.detail)}${c.suggestion ? ` — ${md(c.suggestion)}` : ''} |`,
  )
  .join('\n')}
`);

  sections.push(`## 3. 目录结构

${i.structure.map(line).join('\n')}

配对模块（include/ ↔ src/）：${i.pairedModules.length ? i.pairedModules.map((m) => '`' + md(m) + '`').join('、') : '（无）'}
`);

  sections.push(`## 4. metadata / schema

${i.metadataErrors.length === 0 ? '- ✅ metadata.json 契约校验通过' : i.metadataErrors.map((e) => `- ❌ ${md(e)}`).join('\n')}
`);

  sections.push(`## 5. 工具链

${i.tools.map((t) => `- [${t.ok ? 'x' : ' '}] ${md(t.name)}`).join('\n')}
`);

  sections.push(`## 6. 构建与测试

- 构建：${i.build.ok === undefined ? '未运行' : i.build.ok ? '✅ 成功' : '❌ 失败'}（${md(i.build.detail)}）
- 测试：${i.tests.passed === undefined ? '未运行' : `通过 ${i.tests.passed} · 失败 ${i.tests.failed} · 跳过 ${i.tests.skipped}`}（${md(i.tests.detail)}）
`);

  sections.push(`## 7. 文档与覆盖率

- 文档产物：${i.docsArtifacts.length === 0 ? '（无）' : i.docsArtifacts.map((a) => '`' + md(a) + '`').join('、')}
- 覆盖率报告：${i.coverageReport ? '`' + md(i.coverageReport) + '`' : '（未找到 / 未开启 g++ coverage）'}
`);

  sections.push(`## 8. CI 与安全配置

| 工作流 | 触发 | | 安全配置 |
|--------|------|-|---------|
${(i.workflows.length ? i.workflows.map((w) => `| ${md(w.file)} | ${md(w.name)} (${w.on.join('/')}) | | — |`) : ['| （无 .github/workflows） | — | | — |']).join('\n')}

- gitleaks 配置：${i.security.gitleaks ? '✅' : '❌'} · MegaLinter 配置：${i.security.megalinter ? '✅' : '❌'} · Checkov 配置：${i.security.checkov ? '✅' : '❌'}
`);

  sections.push(`## 9. Git 与质量门禁

- 分支：${md(i.git.branch || '—')} · 工作区：${i.git.clean ? '干净 ✅' : '有未提交变更 ❌'}
- clang-format：${i.quality.formatOk === undefined ? '未运行' : i.quality.formatOk ? '✅' : '❌'} · clang-tidy：${i.quality.tidyOk === undefined ? '未运行' : i.quality.tidyOk ? '✅' : '❌'} · commitlint：${i.quality.commitlintOk === undefined ? '未运行' : i.quality.commitlintOk ? '✅' : '❌'}
`);

  const fails = i.health.checks.filter((c) => c.kind === 'fail');
  sections.push(`## 10. 结论与建议

${fails.length === 0 ? '- ✅ 无阻塞项，可进入发布流程（建议先跑 Preflight 全项确认）。' : fails.map((f) => `- ❌ ${md(f.title)}：${md(f.detail)}${f.suggestion ? ` → ${md(f.suggestion)}` : ''}`).join('\n')}
`);

  return sections.join('\n\n');
}
