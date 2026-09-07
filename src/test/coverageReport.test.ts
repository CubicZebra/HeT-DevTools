import * as assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCoverageReport, parseCoveragePct, readCoveragePct } from '../features/coverage/report';

describe('V5-6 coverage report locating + parsing', () => {
  it('parses genhtml index.html Lines/Functions percentages', () => {
    const html = [
      '<td class="headerItem">Lines:</td>',
      '<td class="headerCovTableEntryMed">76.9&nbsp;%</td>',
      '<td class="headerItem">Functions:</td>',
      '<td class="headerCovTableEntryLo">66.7&nbsp;%</td>',
    ].join('');
    const pct = parseCoveragePct(html);
    assert.strictEqual(pct.line, 76.9);
    assert.strictEqual(pct.func, 66.7);
  });

  it('returns nulls when no summary cells exist', () => {
    assert.deepStrictEqual(parseCoveragePct('<html>no coverage table</html>'), { line: null, func: null });
  });

  it('locates the in-place test_package report first (lane/native actual path)', () => {
    const root = mkdtempSync(join(tmpdir(), 'het-cov-'));
    try {
      const idx = join(root, 'test_package', 'test', 'export', 'coverage', 'coverage_report', 'index.html');
      mkdirSync(join(idx, '..'), { recursive: true });
      writeFileSync(idx, '<html><body><td class="headerItem">Lines:</td><td class="headerCovTableEntryMed">80.0&nbsp;%</td></body></html>');
      assert.strictEqual(findCoverageReport(root), idx);
      const pct = readCoveragePct(findCoverageReport(root));
      assert.strictEqual(pct.line, 80);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to <root>/coverage_report then build trees', () => {
    const root = mkdtempSync(join(tmpdir(), 'het-cov-'));
    try {
      const a = join(root, 'coverage_report', 'index.html');
      mkdirSync(join(a, '..'), { recursive: true });
      writeFileSync(a, '<html>a</html>');
      assert.strictEqual(findCoverageReport(root), a);

      const root2 = mkdtempSync(join(tmpdir(), 'het-cov2-'));
      try {
        const b = join(root2, 'build', 'Debug', 'coverage_report', 'index.html');
        mkdirSync(join(b, '..'), { recursive: true });
        writeFileSync(b, '<html>b</html>');
        assert.strictEqual(findCoverageReport(root2), b);
      } finally {
        rmSync(root2, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
