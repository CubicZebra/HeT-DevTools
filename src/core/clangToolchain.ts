/**
 * V4-4 macOS Provider — pure toolchain helpers.
 *
 * macOS uses the system Xcode CLT (clang). Coverage on Apple clang is NOT the
 * GNU lcov/gcov pair — it is `xcrun llvm-cov gcov` (llvm-cov understands
 * gcov data). These helpers stay pure; the host probe (features/env/macosProbe)
 * gathers real output and feeds these parsers.
 */

export const MACOS_COVERAGE_NOTE =
  '覆盖率经 xcrun llvm-cov gcov 适配（Apple clang 无 GNU gcov；lcov 工具链由扩展托管）';

/** Parse `clang --version` first line → e.g. '16.0.0' | undefined. */
export function parseClangVersion(output: string): string | undefined {
  const m = /version\s+(\d+(?:\.\d+)*)/u.exec(output);
  return m?.[1];
}

/** Parse `xcode-select -p` output → '/Applications/Xcode.app/Contents/Developer' | undefined. */
export function parseXcodeSelectOutput(output: string): string | undefined {
  const p = output.trim().split(/\r?\n/u)[0]?.trim();
  return p && p.length > 0 && !p.startsWith('xcode-select:') ? p : undefined;
}

/** Parse `xcrun --find clang` output → clang executable path | undefined. */
export function parseXcrunFindOutput(output: string): string | undefined {
  const p = output.trim().split(/\r?\n/u)[0]?.trim();
  return p && p.length > 0 && !p.startsWith('xcrun:') && p.includes('/') ? p : undefined;
}

/** macOS needs llvm-cov for gcov data; wrap as a gcov-compatible command. */
export function llvmCovGcovArgs(outputDir: string): string[] {
  return ['llvm-cov', 'gcov', '--source-directory', outputDir];
}
