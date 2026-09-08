import * as assert from 'node:assert';
import { healthGapLabels, runHealthCheck, verdictZh } from '../core/healthCheck';
import { FcppMetadata, FcppProject, ToolStatus } from '../types';

function meta(overrides: Partial<FcppMetadata> = {}): FcppMetadata {
  return {
    name: 'demo',
    version: '0.1.0',
    build_type: 'Debug',
    trigger_tests: true,
    activate_code_coverage: true,
    doc_languages: ['en', 'zh'],
    workflow_triggers: { build: true, tests: true, release: false, docs: false, security_scan: true },
    dependencies: { common: {}, c: {}, cpp: {}, infra: { GTest: ['gtest::gtest'] } },
    ...overrides,
  };
}

function project(m: FcppMetadata | undefined, metadataError?: string): FcppProject {
  return { root: 'C:/synthetic/project', level: 'full', metadata: m, metadataError };
}

function tool(name: string, state: ToolStatus['state'] = 'ok'): ToolStatus {
  return { name, state, foundPath: `C:/tools/${name}.exe`, version: '9.9.9' };
}

describe('healthCheck', () => {
  it('healthy synthetic project with ok tools/state → PASS with high score', async () => {
    const report = await runHealthCheck({
      project: project(meta()),
      tools: { conan: tool('conan'), git: tool('git') },
      state: { lastBuildOk: true, lastTestsOk: true },
    });
    assert.strictEqual(report.verdict, 'PASS');
    assert.ok(report.score >= 80, `score was ${report.score}`);
  });

  it('flags missing conan and all-off CI switches as failures', async () => {
    const report = await runHealthCheck({
      project: project(meta({ workflow_triggers: { build: false, tests: false } })),
      tools: {},
    });
    const conan = report.checks.find((c) => c.id === 'env.conan');
    const switches = report.checks.find((c) => c.id === 'switches.ci');
    assert.strictEqual(conan?.kind, 'fail');
    assert.strictEqual(switches?.kind, 'fail');
  });

  it('reports unparsable metadata', async () => {
    const report = await runHealthCheck({
      project: project(undefined, 'invalid JSON in metadata.json: ...'),
      tools: { conan: tool('conan'), git: tool('git') },
    });
    const parsed = report.checks.find((c) => c.id === 'meta.parsed');
    assert.strictEqual(parsed?.kind, 'fail');
    assert.strictEqual(report.verdict, 'FAIL');
  });

  it('optional feature gaps become warnings, not failures', async () => {
    const report = await runHealthCheck({
      project: project(meta({ activate_code_coverage: false, doc_languages: undefined })),
      tools: { conan: tool('conan'), git: tool('git') },
      state: { lastBuildOk: true, lastTestsOk: true },
    });
    const coverage = report.checks.find((c) => c.id === 'coverage.enabled');
    const docs = report.checks.find((c) => c.id === 'docs.enabled');
    assert.strictEqual(coverage?.kind, 'warn');
    assert.strictEqual(docs?.kind, 'warn');
    // requireds all ok → not FAIL
    assert.notStrictEqual(report.verdict, 'FAIL');
  });

  it('lane env fact overrides which-sniffing for the conan rule', async () => {
    const ready = await runHealthCheck({ project: project(meta()), tools: {}, env: { conan: true } });
    assert.strictEqual(ready.checks.find((c) => c.id === 'env.conan')?.kind, 'ok');
    assert.ok(ready.checks.find((c) => c.id === 'env.conan')?.detail.includes('托管车道'));
    const missing = await runHealthCheck({ project: project(meta()), tools: {}, env: { conan: false } });
    assert.strictEqual(missing.checks.find((c) => c.id === 'env.conan')?.kind, 'fail');
    // absent env fact → fall back to tools sniffing
    const sniffed = await runHealthCheck({ project: project(meta()), tools: {}, env: undefined });
    assert.strictEqual(sniffed.checks.find((c) => c.id === 'env.conan')?.kind, 'fail');
  });

  it('weights sum to 100', async () => {
    const report = await runHealthCheck({ project: project(meta()) });
    const sum = report.checks.reduce((a, c) => a + c.weight, 0);
    assert.strictEqual(sum, 100);
  });

  it('V5-6 graded scoring: coverage 90% = full, on-without-report = partial', async () => {
    const full = await runHealthCheck({
      project: project(meta()),
      tools: { conan: tool('conan'), git: tool('git') },
      state: { lastBuildOk: true, lastTestsOk: true },
      coverage: { found: true, line: 90 },
    });
    const cov = full.checks.find((c) => c.id === 'coverage.enabled')!;
    assert.strictEqual(cov.kind, 'ok');
    assert.strictEqual(cov.grade, 1);
    const bare = await runHealthCheck({
      project: project(meta()),
      tools: { conan: tool('conan'), git: tool('git') },
      state: { lastBuildOk: true, lastTestsOk: true },
      coverage: { found: false, line: null },
    });
    const covBare = bare.checks.find((c) => c.id === 'coverage.enabled')!;
    assert.strictEqual(covBare.kind, 'warn');
    assert.strictEqual(covBare.grade, 0.4, 'enabled-but-no-report is only 2/5');
    const off = await runHealthCheck({ project: project(meta({ activate_code_coverage: false })), tools: {}, state: {} });
    assert.strictEqual(off.checks.find((c) => c.id === 'coverage.enabled')?.grade, 0);
  });

  it('V5-6 graded scoring: tests — fail=0.2 · skip/low-count=0.7 · all green=1.0', async () => {
    const run = (testsRun: { passed: number; failed: number; skipped: number }) =>
      runHealthCheck({ project: project(meta()), tools: {}, state: { lastBuildOk: true, testsRun } });
    const bad = await run({ passed: 4, failed: 2, skipped: 0 });
    assert.strictEqual(bad.checks.find((c) => c.id === 'state.tests')?.grade, 0.2);
    const skip = await run({ passed: 10, failed: 0, skipped: 3 });
    assert.strictEqual(skip.checks.find((c) => c.id === 'state.tests')?.grade, 0.7);
    const few = await run({ passed: 2, failed: 0, skipped: 0 });
    assert.strictEqual(few.checks.find((c) => c.id === 'state.tests')?.grade, 0.7);
    const green = await run({ passed: 12, failed: 0, skipped: 0 });
    assert.strictEqual(green.checks.find((c) => c.id === 'state.tests')?.grade, 1);
  });

  it('C1: every non-ok graded check carries a concrete next-step suggestion', async () => {
    const r = await runHealthCheck({
      project: project(meta()),
      tools: {},
      state: {},
      coverage: { found: false, line: null },
    });
    const find = (id: string) => r.checks.find((c) => c.id === id)!;
    assert.ok(find('coverage.enabled').suggestion?.includes('生成覆盖率'), 'coverage-on-no-report suggests the one-click action');
    assert.ok(find('state.build').suggestion?.includes('构建'), 'never-built suggests building');
    assert.ok(find('state.tests').suggestion?.includes('构建并测试'), 'never-tested suggests build+test');
    assert.ok(find('env.conan').suggestion?.length, 'missing conan suggests an action');
    const off = await runHealthCheck({ project: project(meta({ activate_code_coverage: false })), tools: {}, state: {} });
    const cov = off.checks.find((c) => c.id === 'coverage.enabled')!;
    assert.ok(cov.suggestion?.includes('项目设置'), 'coverage-off points to the settings panel');
  });

  it('V5-6 graded scoring: build success-without-tests is 0.75 (not full)', async () => {
    const r = await runHealthCheck({
      project: project(meta()),
      tools: { conan: tool('conan'), git: tool('git') },
      state: { lastBuildOk: true },
    });
    const build = r.checks.find((c) => c.id === 'state.build')!;
    assert.strictEqual(build.grade, 0.75);
    assert.strictEqual(build.kind, 'warn');
  });

  it('verdictZh and healthGapLabels drive the hover 工程健康 row (V5-2)', async () => {
    assert.strictEqual(verdictZh('PASS'), '良好');
    assert.strictEqual(verdictZh('WARN'), '需改进');
    assert.strictEqual(verdictZh('FAIL'), '不达标');
    const weak = await runHealthCheck({ project: project(meta({ activate_code_coverage: false })), tools: {}, state: {} });
    const gaps = healthGapLabels(weak);
    assert.ok(Array.isArray(gaps) && gaps.length <= 3);
    assert.ok(gaps.includes('conan 未就绪'), `gaps carry plain labels: ${gaps.join(',')}`);
    assert.ok(gaps.includes('构建未验证') || gaps.includes('git 缺失'), `top-3 fail/warn gaps: ${gaps.join(',')}`);
    const strong = await runHealthCheck({
      project: project(meta()),
      tools: { conan: tool('conan'), git: tool('git') },
      state: { lastBuildOk: true, lastTestsOk: true },
    });
    const strongGaps = healthGapLabels(strong);
    assert.ok(!strongGaps.includes('conan 未就绪'), `required tool gaps gone in strong project: ${strongGaps.join(',')}`);
    assert.ok(!strongGaps.includes('覆盖率未开'));
  });
});
