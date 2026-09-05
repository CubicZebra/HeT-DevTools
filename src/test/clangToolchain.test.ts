import * as assert from 'node:assert';
import {
  MACOS_COVERAGE_NOTE,
  llvmCovGcovArgs,
  parseClangVersion,
  parseXcodeSelectOutput,
  parseXcrunFindOutput,
} from '../core/clangToolchain';

describe('V4-4 clangToolchain (macOS pure helpers)', () => {
  it('parses Apple clang version strings', () => {
    assert.strictEqual(parseClangVersion('Apple clang version 16.0.0 (clang-1600.0.26.6)'), '16.0.0');
    assert.strictEqual(parseClangVersion('clang version 17.0.6'), '17.0.6');
    assert.strictEqual(parseClangVersion('zsh: command not found: clang'), undefined);
    assert.strictEqual(parseClangVersion(''), undefined);
  });

  it('parses xcode-select -p output', () => {
    assert.strictEqual(parseXcodeSelectOutput('/Applications/Xcode.app/Contents/Developer\n'), '/Applications/Xcode.app/Contents/Developer');
    assert.strictEqual(parseXcodeSelectOutput('xcode-select: error: unable to get active developer directory\n'), undefined);
  });

  it('parses xcrun --find clang output', () => {
    assert.strictEqual(parseXcrunFindOutput('/usr/bin/clang\n'), '/usr/bin/clang');
    assert.strictEqual(parseXcrunFindOutput('xcrun: error: unable to find clang\n'), undefined);
  });

  it('llvm-cov gcov wraps a gcov-compatible shim', () => {
    assert.deepStrictEqual(llvmCovGcovArgs('/tmp/cov'), ['llvm-cov', 'gcov', '--source-directory', '/tmp/cov']);
  });

  it('coverage note is explicit about Apple clang (no GNU gcov)', () => {
    assert.ok(MACOS_COVERAGE_NOTE.includes('llvm-cov'));
    assert.ok(MACOS_COVERAGE_NOTE.includes('gcov'));
  });
});
