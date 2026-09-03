/**
 * GTest console output parser (development-plan T-1.7 / G-05).
 * Pure logic — no VS Code imports.
 *
 * Handles the classic gtest console lines:
 *   [ RUN      ] Suite.Case
 *   [       OK ] Suite.Case (12 ms)
 *   [  FAILED  ] Suite.Case (12 ms)
 *   [  SKIPPED ] Suite.Case
 * Failure detail lines (between RUN and FAILED):
 *   /abs/path/file.cpp:41: Failure
 *   Expected equality of these values:
 *   ...
 */

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface GTestResult {
  suite: string;
  name: string;
  status: TestStatus;
  durationMs?: number;
  /** Failure location parsed from gtest detail lines (file:line: Failure). */
  failureFile?: string;
  failureLine?: number;
  /** Human-readable failure message (the detail block). */
  failureMessage?: string;
}

export interface GTestRunSummary {
  tests: GTestResult[];
  passed: number;
  failed: number;
  skipped: number;
  /** True when no test cases were discovered at all. */
  empty: boolean;
}

const RUN_RE = /^\s*\[ RUN\s+\]\s+([^. ]+)\.([^ ]+)/;
const OK_RE = /^\s*\[\s+OK\s+\]\s+([^. ]+)\.([^ ]+)(?:\s*\((\d+)\s*ms\))?/;
const FAILED_RE = /^\s*\[\s+FAILED\s+\]\s+([^. ]+)\.([^ ]+)(?:\s*\((\d+)\s*ms\))?/;
const SKIPPED_RE = /^\s*\[\s+SKIPPED\s+\]\s+([^. ]+)\.([^ ]+)(?:\s*\((\d+)\s*ms\))?/;
/** CTest console line:  1/5 Test #1: Suite.Case .....   Passed    3.03 sec */
const CTEST_RE = /^\s*\d+\/\d+\s+Test\s+#\d+:\s+(.+?)\s*\.+\s*(\**\s*(?:Passed|Failed|Skipped|Not Run|Timeout))\b/;
const FAILURE_LOC_RE = /^(.*?):(\d+):\s*Failure$/;

interface InFlight {
  suite: string;
  name: string;
  lines: string[];
}

export function parseGTestOutput(output: string): GTestRunSummary {
  const tests = new Map<string, GTestResult>();
  let inFlight: InFlight | undefined;

  const finalize = (status: TestStatus, durationMs?: number): void => {
    if (!inFlight) {
      return;
    }
    const key = `${inFlight.suite}.${inFlight.name}`;
    const result: GTestResult = {
      suite: inFlight.suite,
      name: inFlight.name,
      status,
      durationMs,
    };
    const parts = inFlight.lines;
    if (status === 'failed') {
      const locIdx = parts.findIndex((l) => FAILURE_LOC_RE.test(l));
      if (locIdx >= 0) {
        const loc = FAILURE_LOC_RE.exec(parts[locIdx]);
        if (loc) {
          result.failureFile = loc[1].trim();
          result.failureLine = Number.parseInt(loc[2], 10);
          result.failureMessage = parts.slice(locIdx + 1).join('\n').trim();
        }
      }
      if (!result.failureMessage && parts.length > 0) {
        result.failureMessage = parts.join('\n').trim();
      }
    }
    if (!tests.has(key)) {
      tests.set(key, result);
    }
    inFlight = undefined;
  };

  for (const raw of output.split(/\r?\n/)) {
    const line = raw;

    const runMatch = RUN_RE.exec(line);
    if (runMatch) {
      // previous case never finalized (aborted) → drop
      inFlight = { suite: runMatch[1], name: runMatch[2], lines: [] };
      continue;
    }

    if (inFlight) {
      const okMatch = OK_RE.exec(line);
      if (okMatch && okMatch[1] === inFlight.suite && okMatch[2] === inFlight.name) {
        finalize('passed', okMatch[3] ? Number.parseInt(okMatch[3], 10) : undefined);
        continue;
      }
      const skipMatch = SKIPPED_RE.exec(line);
      if (skipMatch && skipMatch[1] === inFlight.suite && skipMatch[2] === inFlight.name) {
        finalize('skipped', skipMatch[3] ? Number.parseInt(skipMatch[3], 10) : undefined);
        continue;
      }
      const failMatch = FAILED_RE.exec(line);
      if (failMatch && failMatch[1] === inFlight.suite && failMatch[2] === inFlight.name) {
        finalize('failed', failMatch[3] ? Number.parseInt(failMatch[3], 10) : undefined);
        continue;
      }
      // detail lines while a case is running
      inFlight.lines.push(line);
      continue;
    }

    // Case marked failed in the trailing summary list (if we missed its RUN block).
    const summaryFail = FAILED_RE.exec(line);
    if (summaryFail) {
      const key = `${summaryFail[1]}.${summaryFail[2]}`;
      if (!tests.has(key)) {
        tests.set(key, {
          suite: summaryFail[1],
          name: summaryFail[2],
          status: 'failed',
          durationMs: summaryFail[3] ? Number.parseInt(summaryFail[3], 10) : undefined,
        });
      }
    }
  }
  // dangling in-flight case without an end marker: treat as failed with unknown reason
  if (inFlight) {
    finalize('failed');
  }

  const list = [...tests.values()];
  const passed = list.filter((t) => t.status === 'passed').length;
  const failed = list.filter((t) => t.status === 'failed').length;
  const skipped = list.filter((t) => t.status === 'skipped').length;
  if (list.length > 0) {
    return { tests: list, passed, failed, skipped, empty: false };
  }

  // Fallback: `conan create` drives gtest through CTest, which only prints
  // ctest summary lines (no [ RUN ] markers). Parse those when gtest lines
  // are absent.
  return parseCtestOutput(output);
}

/** Parse CTest summary lines (used when raw gtest output is unavailable). */
export function parseCtestOutput(output: string): GTestRunSummary {
  const tests: GTestResult[] = [];
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = CTEST_RE.exec(line);
    if (!match) {
      continue;
    }
    const rawName = match[1].trim();
    const rawStatus = match[2].replace(/^\*+\s*/, '').trim();
    const status: TestStatus = /^Passed/i.test(rawStatus)
      ? 'passed'
      : /^Failed|Timeout/i.test(rawStatus)
        ? 'failed'
        : 'skipped';
    const lastDot = rawName.lastIndexOf('.');
    const suite = lastDot >= 0 ? rawName.slice(0, lastDot) : 'suite';
    const name = lastDot >= 0 ? rawName.slice(lastDot + 1) : rawName;
    const key = `${suite}.${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      tests.push({ suite, name, status });
    }
  }
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  return { tests, passed, failed, skipped, empty: tests.length === 0 };
}
