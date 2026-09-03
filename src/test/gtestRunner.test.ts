import * as assert from 'node:assert';
import { GTestRunSummary, parseGTestOutput } from '../core/gtestRunner';

const PASS_AND_FAIL = [
  '[==========] Running 3 tests from 2 test suites.',
  '[----------] Global test environment set-up.',
  '[----------] 2 tests from etl_test',
  '[ RUN      ] etl_test.vec_add_f32',
  '[       OK ] etl_test.vec_add_f32 (1 ms)',
  '[ RUN      ] etl_test.vec_boundary',
  'C:/repo/src/etl.cpp:41: Failure',
  'Expected equality of these values:',
  '  out[3]',
  '    Which is: 6.000001',
  '  Which is: 6.0',
  '[  FAILED  ] etl_test.vec_boundary (12 ms)',
  '[----------] 1 test from net_test',
  '[ RUN      ] net_test.train_smoke',
  '[  SKIPPED ] net_test.train_smoke (0 ms)',
  '[----------] Global test environment tear-down',
  '[==========] 3 tests from 2 test suites ran. (18 ms total)',
  '[  PASSED  ] 2 tests.',
  '[  FAILED  ] 1 test, listed below:',
  '[  FAILED  ] etl_test.vec_boundary',
].join('\n');

describe('gtestRunner', () => {
  it('falls back to CTest summary lines when gtest markers are absent', () => {
    const ctest = [
      'Test project C:/.../test_package/build',
      '      Start 1: Stress.Sleep',
      '  1/5 Test #1: Stress.Sleep .....................   Passed    3.03 sec',
      '      Start 2: Title1.Tag1',
      '  2/5 Test #2: Title1.Tag1 ......................   Passed    0.03 sec',
      '      Start 3: Title2.Tag1',
      '  3/5 Test #3: Title2.Tag1 ......................***Failed    0.02 sec',
      '  100% tests passed, 0 tests failed out of 3',
    ].join('\n');
    const summary = parseGTestOutput(ctest);
    assert.strictEqual(summary.empty, false);
    assert.strictEqual(summary.passed, 2);
    assert.strictEqual(summary.failed, 1);
    const t = summary.tests.find((x) => x.name === 'Tag1' && x.suite === 'Title2');
    assert.strictEqual(t?.status, 'failed');
  });

  it('parses passed/failed/skipped cases and totals', () => {
    const summary: GTestRunSummary = parseGTestOutput(PASS_AND_FAIL);
    assert.strictEqual(summary.passed, 1);
    assert.strictEqual(summary.failed, 1);
    assert.strictEqual(summary.skipped, 1);
    assert.strictEqual(summary.empty, false);
    assert.strictEqual(summary.tests.length, 3);
  });

  it('extracts failure location and message from the detail block', () => {
    const summary = parseGTestOutput(PASS_AND_FAIL);
    const bad = summary.tests.find((t) => t.name === 'vec_boundary');
    assert.ok(bad);
    assert.strictEqual(bad?.status, 'failed');
    assert.strictEqual(bad?.durationMs, 12);
    assert.strictEqual(bad?.failureFile, 'C:/repo/src/etl.cpp');
    assert.strictEqual(bad?.failureLine, 41);
    assert.ok(bad?.failureMessage?.includes('Expected equality of these values'));
  });

  it('returns empty=true when no gtest markers are present', () => {
    const summary = parseGTestOutput('[100%] Built target demo\nBuild succeeded.');
    assert.strictEqual(summary.empty, true);
    assert.strictEqual(summary.passed, 0);
  });

  it('keeps suites groupable', () => {
    const summary = parseGTestOutput(PASS_AND_FAIL);
    const suites = new Set(summary.tests.map((t) => t.suite));
    assert.deepStrictEqual([...suites].sort(), ['etl_test', 'net_test']);
  });
});
