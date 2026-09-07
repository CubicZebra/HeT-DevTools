import * as assert from 'node:assert';
import { runHealthCheck } from '../core/healthCheck';
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
});
