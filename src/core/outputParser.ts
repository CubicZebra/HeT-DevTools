import { ParsedIssue } from '../types';

/**
 * Compiler output parser → diagnostic items (development-plan T-1.5).
 * Handles MSVC and GCC/Clang line formats.
 *
 * MSVC   : C:\path\file.cpp(12,5): error C2143: syntax error ...
 * GCC    : src/etl.cpp:12:5: error: 'transform' was not declared ...
 * Clang  : same shape as GCC (also "fatal error:").
 */

const MSVC_RE = /^(.+?)\((\d+)(?:,(\d+))?\)\s*:\s*(fatal error|error|warning)\s+(?:[A-Z]+\d+)?\s*:?\s*(.+)$/;
const GCC_RE = /^(.+?):(\d+)(?::(\d+))?\s*:\s*(fatal error|error|warning):\s*(.+)$/;

export function parseCompilerOutput(output: string): ParsedIssue[] {
  const issues: ParsedIssue[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '');
    if (line.trim().length === 0) {
      continue;
    }

    const msvc = MSVC_RE.exec(line);
    if (msvc) {
      issues.push({
        severity: msvc[4] === 'warning' ? 'warning' : 'error',
        file: msvc[1].trim(),
        line: Number.parseInt(msvc[2], 10),
        column: msvc[3] ? Number.parseInt(msvc[3], 10) : undefined,
        message: msvc[5].trim(),
        origin: 'msvc',
      });
      continue;
    }

    const gcc = GCC_RE.exec(line);
    if (gcc) {
      issues.push({
        severity: gcc[4] === 'warning' ? 'warning' : 'error',
        file: gcc[1].trim(),
        line: Number.parseInt(gcc[2], 10),
        column: gcc[3] ? Number.parseInt(gcc[3], 10) : undefined,
        message: gcc[5].trim(),
        origin: 'gcc-clang',
      });
    }
  }
  return dedupe(issues);
}

function dedupe(issues: ParsedIssue[]): ParsedIssue[] {
  const seen = new Set<string>();
  const out: ParsedIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.severity}|${issue.file}|${issue.line}|${issue.column ?? ''}|${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(issue);
    }
  }
  return out;
}
