import * as assert from 'node:assert';
import { parseCompilerOutput } from '../core/outputParser';

const MSVC_SAMPLE = [
  '1>------ Build started: Project: fcpp, Configuration: Debug x64 ------',
  'src\\etl.cpp(12,5): error C2143: syntax error : missing \';\' before \'}\'',
  'include\\net.hpp(7): warning C4100: \'x\': unreferenced formal parameter',
  'C:\\work\\lib\\src\\util.cpp(3): fatal error C1083: Cannot open include file: \'nope.h\'',
  'Build FAILED.',
].join('\n');

const GCC_SAMPLE = [
  '[ 25%] Building CXX object CMakeFiles/...',
  'src/etl.cpp:12:5: error: \'transform\' was not declared in this scope',
  'include/net.hpp:7:1: warning: unused parameter \'x\' [-Wunused-parameter]',
  'src/net.cpp:3: fatal error: nope.h: No such file or directory',
].join('\n');

describe('outputParser', () => {
  it('parses MSVC error/warning/fatal lines', () => {
    const issues = parseCompilerOutput(MSVC_SAMPLE);
    assert.strictEqual(issues.length, 3);

    const err = issues.find((i) => i.message.includes('syntax error'));
    assert.ok(err);
    assert.strictEqual(err?.severity, 'error');
    assert.strictEqual(err?.origin, 'msvc');
    assert.strictEqual(err?.file, 'src\\etl.cpp');
    assert.strictEqual(err?.line, 12);
    assert.strictEqual(err?.column, 5);

    const warn = issues.find((i) => i.message.includes('unreferenced formal parameter'));
    assert.strictEqual(warn?.severity, 'warning');
    assert.strictEqual(warn?.column, undefined);

    const fatal = issues.find((i) => i.message.includes('Cannot open include file'));
    assert.strictEqual(fatal?.severity, 'error');
    assert.ok(fatal?.file.includes('util.cpp'));
  });

  it('parses GCC/Clang error/warning/fatal lines', () => {
    const issues = parseCompilerOutput(GCC_SAMPLE);
    assert.strictEqual(issues.length, 3);

    const err = issues.find((i) => i.message.includes('was not declared'));
    assert.ok(err);
    assert.strictEqual(err?.severity, 'error');
    assert.strictEqual(err?.origin, 'gcc-clang');
    assert.strictEqual(err?.file, 'src/etl.cpp');
    assert.strictEqual(err?.line, 12);
    assert.strictEqual(err?.column, 5);

    const warn = issues.find((i) => i.message.includes('unused parameter'));
    assert.strictEqual(warn?.severity, 'warning');
    assert.strictEqual(warn?.line, 7);
  });

  it('ignores non-diagnostic build lines', () => {
    const issues = parseCompilerOutput('Build FAILED.\n[ 25%] Building...\n1>------ Build started');
    assert.strictEqual(issues.length, 0);
  });

  it('dedupes repeated identical diagnostics', () => {
    const one = 'src/a.cpp:1:1: error: boom';
    const issues = parseCompilerOutput([one, one, one].join('\n'));
    assert.strictEqual(issues.length, 1);
  });
});
