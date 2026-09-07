/**
 * V5-6 coverage report locating + parsing — ONE shared source for the
 * coverage panel, the chip "代码覆盖" row and the `het.openCoverageReport`
 * command.
 *
 * Where a coverage_report/index.html can live:
 *   - `<root>/test_package/test/export/coverage/coverage_report` — the fcpp
 *     template runs `conan create`'s test step IN PLACE (gcov/lcov/genhtml),
 *     so on every host (native or the WSL lane) the report lands right there;
 *   - `<root>/coverage_report` — canonical project-level location;
 *   - a `coverage_report` under `<root>/build` — generic build-tree fallback;
 *   - the machine conan cache `<home>/.conan2/p` — fallback for native builds
 *     that export the test_package into the cache instead of in place.
 */
import { join, sep } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

export interface CoveragePct {
  line: number | null;
  func: number | null;
}

/** Parse genhtml's index.html summary cells (Lines/Functions → "76.9 %"). */
export function parseCoveragePct(html: string): CoveragePct {
  const out: CoveragePct = { line: null, func: null };
  // genhtml markup: <td class="headerItem">Lines:</td><td class="headerCovTableEntryMed">76.9&nbsp;%</td>
  const re = /headerItem">(Lines|Functions):<\/td>\s*<td class="headerCovTableEntry[^"]*">([\d.]+)&nbsp;%<\/td>/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = Number(m[2]);
    if (Number.isFinite(v)) {
      if (m[1] === 'Lines') {
        out.line = v;
      } else {
        out.func = v;
      }
    }
  }
  // Tolerant fallback: first two "<digit> %" tokens in the header table.
  if (out.line === null) {
    const alt = /headerCovTableEntry[^"]*">(\d+(?:\.\d+)?)&nbsp;%/gu.exec(html);
    if (alt) {
      out.line = Number(alt[1]);
    }
  }
  return out;
}

/** Recursively scan `dir` (bounded) for a `coverage_report` folder holding index.html. */
function scanForReport(dir: string, depth: number, hit: { v: string }): void {
  if (hit.v || depth > 6) {
    return;
  }
  let entries: { name: string; isDir: boolean }[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch {
    return;
  }
  for (const e of entries) {
    if (hit.v) {
      return;
    }
    const abs = join(dir, e.name);
    if (!e.isDir) {
      continue;
    }
    if (e.name === 'coverage_report' && existsSync(join(abs, 'index.html'))) {
      hit.v = join(abs, 'index.html');
      return;
    }
    if (!e.name.startsWith('.') && e.name !== 'node_modules' && !/^coverage_report$/u.test(e.name)) {
      scanForReport(abs, depth + 1, hit);
    }
  }
}

/**
 * Locate a coverage_report/index.html (first hit wins, bounded walk).
 * Returns the absolute path or '' when none exists.
 */
export function findCoverageReport(root: string): string {
  const hit = { v: '' };
  // Fast direct candidates first (cheap existsSync), deepest recursion last.
  const direct = [
    join(root, 'test_package', 'test', 'export', 'coverage', 'coverage_report', 'index.html'),
    join(root, 'coverage_report', 'index.html'),
    join(root, 'build'),
  ];
  for (const d of direct) {
    if (d.endsWith('index.html')) {
      if (existsSync(d)) {
        return d;
      }
      continue;
    }
    if (d.endsWith(sep + 'build')) {
      scanForReport(d, 0, hit);
      if (hit.v) {
        return hit.v;
      }
    }
  }
  // Fallback: the machine-wide conan cache (native exports land there).
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  if (home) {
    scanForReport(join(home, '.conan2', 'p'), 0, hit);
  }
  return hit.v;
}

/** Read + parse the report file ('' tolerated). */
export function readCoveragePct(indexHtml: string): CoveragePct {
  if (!indexHtml) {
    return { line: null, func: null };
  }
  try {
    return parseCoveragePct(readFileSync(indexHtml, 'utf8'));
  } catch {
    return { line: null, func: null };
  }
}
