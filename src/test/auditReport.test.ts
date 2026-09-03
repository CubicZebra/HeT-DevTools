import * as assert from 'node:assert';
import { renderAuditMarkdown, AuditInput } from '../core/auditReport';
import { HealthReport } from '../core/healthCheck';

const health: HealthReport = {
  score: 92,
  verdict: 'PASS',
  checks: [
    { id: 'env', title: '环境就绪', kind: 'ok', detail: 'conan/doxygen 在 PATH', weight: 30 },
    { id: 'meta', title: 'metadata schema', kind: 'ok', detail: '合规', weight: 20 },
  ],
};

const input: AuditInput = {
  generatedAt: '2026-09-03T10:00:00',
  projectName: 'fcpp',
  version: '0.1.0',
  target: 'auto',
  health,
  structure: [
    { path: 'include/', present: true },
    { path: 'src/', present: true },
    { path: 'docs/', present: false },
  ],
  pairedModules: ['cpptest', 'etl'],
  metadataErrors: [],
  tools: [
    { name: 'conan', ok: true },
    { name: 'doxygen', ok: false },
  ],
  build: { ok: true, detail: '最近一次 conan create 成功' },
  tests: { passed: 7, failed: 0, skipped: 1, detail: 'Debug' },
  docsArtifacts: ['docs/sphinx/build/html/index.html'],
  coverageReport: null,
  workflows: [{ file: 'ci-build-test.yml', name: 'CI Build', on: ['push'] }],
  security: { gitleaks: true, megalinter: false, checkov: true },
  git: { branch: 'main', clean: true },
  quality: { formatOk: true, commitlintOk: true, tidyOk: undefined },
};

describe('auditReport.renderAuditMarkdown', () => {
  it('renders all ten sections with badges and tables', () => {
    const md = renderAuditMarkdown(input);
    for (const h of ['# fcpp — 项目审计报告', '## 2. 健康评分明细', '## 3. 目录结构', '## 4. metadata / schema', '## 5. 工具链', '## 6. 构建与测试', '## 7. 文档与覆盖率', '## 8. CI 与安全配置', '## 9. Git 与质量门禁', '## 10. 结论与建议']) {
      assert.ok(md.includes(h), `missing ${h}`);
    }
    assert.ok(md.includes('92/100'));
    assert.ok(md.includes('`cpptest`'));
    assert.ok(md.includes('✅ 成功'));
    assert.ok(md.includes('通过 7 · 失败 0 · 跳过 1'));
    assert.ok(md.includes('可进入发布流程'));
  });
  it('flags blocking failures in the conclusion', () => {
    const failing: AuditInput = {
      ...input,
      health: { ...health, verdict: 'FAIL', score: 40, checks: [{ id: 'x', title: '构建', kind: 'fail', detail: '失败', weight: 20 }] },
    };
    const md = renderAuditMarkdown(failing);
    assert.ok(md.includes('❌ 构建'));
    assert.ok(!md.includes('可进入发布流程'));
  });
});
