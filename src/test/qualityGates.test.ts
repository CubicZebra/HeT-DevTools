import * as assert from 'node:assert';
import {
  clangFormatCheckArgs,
  collectHeaders,
  formatConfigForFile,
  lintCommitHeader,
  parseClangFormatOutput,
  parseClangTidyOutput,
  parseCommitHeader,
} from '../core/qualityGates';

describe('qualityGates.formatConfigForFile', () => {
  it('routes C vs C++ extensions to the dual configs', () => {
    assert.strictEqual(formatConfigForFile('src/a.c'), 'c');
    assert.strictEqual(formatConfigForFile('include/a.h'), 'c');
    assert.strictEqual(formatConfigForFile('src/a.cpp'), 'cpp');
    assert.strictEqual(formatConfigForFile('include/a.hpp'), 'cpp');
    assert.strictEqual(formatConfigForFile('src/a.hxx'), 'cpp');
    assert.strictEqual(formatConfigForFile('README.md'), null);
  });
});

describe('qualityGates.clangFormat', () => {
  it('builds check/fix args with the right config file', () => {
    const args = clangFormatCheckArgs('src/a.cpp', 'cpp');
    assert.deepStrictEqual(args, ['--dry-run', '--Werror', '--style=file:.github/misc/.clang-format-cpp', 'src/a.cpp']);
  });
  it('parses dry-run violations per file', () => {
    const out = `out/x.cpp:1:14: error: code should be clang-formatted [-Wclang-format-violations]
int main(){return 0;}
out/x.cpp:1:32: error: code should be clang-formatted [-Wclang-format-violations]
out/y.c:3:2: error: code should be clang-formatted [-Wclang-format-violations]`;
    const issues = parseClangFormatOutput(out);
    assert.strictEqual(issues.length, 2);
    assert.strictEqual(issues[0].file, 'out/x.cpp');
    assert.strictEqual(issues[1].file, 'out/y.c');
    assert.strictEqual(issues[0].line, 1);
  });
});

describe('qualityGates.parseClangTidyOutput', () => {
  it('parses warning/error lines with check name', () => {
    const out = `src/etl.cpp:12:3: warning: use 'std::transform' instead of loop [modernize-use-transforms]
src/net.cpp:3:1: error: function could be static [readability-convert-member-functions-to-static]`;
    const issues = parseClangTidyOutput(out);
    assert.strictEqual(issues.length, 2);
    assert.strictEqual(issues[0].check, 'tidy');
    assert.ok(issues[0].message.includes('modernize-use-transforms'));
    assert.strictEqual(issues[1].line, 3);
  });
});

describe('qualityGates.commitlint', () => {
  it('accepts canonical fcpp headers', () => {
    assert.deepStrictEqual(lintCommitHeader('feat(:building_construction:): add mymod').errors, []);
    assert.deepStrictEqual(lintCommitHeader('fix: null check').errors, []);
    assert.deepStrictEqual(lintCommitHeader('chore(release): 1.0.0 [skip ci]').errors, []);
  });
  it('rejects bad types / case / missing subject', () => {
    assert.deepStrictEqual(lintCommitHeader('feat(:fire:)!: breaking change').errors, []);
    assert.ok(lintCommitHeader('Feat: wrong case').errors.some((e) => e.includes('type-case')));
    assert.ok(lintCommitHeader('bogus: nope').errors.some((e) => e.includes('type-enum')));
    assert.ok(lintCommitHeader('feat:').errors.some((e) => e.includes('subject-empty')));
    assert.ok(lintCommitHeader('').errors.some((e) => e.includes('type-empty')));
  });
  it('parses breaking and scopes', () => {
    const breaking = parseCommitHeader('feat!: drop old api');
    assert.strictEqual(breaking.type, 'feat');
    assert.strictEqual(breaking.breaking, true);
    const normal = parseCommitHeader('feat(:fire:): cross-compile');
    assert.strictEqual(normal.type, 'feat');
    assert.strictEqual(normal.scope, ':fire:');
    assert.strictEqual(normal.subject, 'cross-compile');
  });
  it('collects headers from git log output', () => {
    const raw = 'feat(a): one\r\nfix(b): two\r\n\r\n';
    assert.deepStrictEqual(collectHeaders(raw), ['feat(a): one', 'fix(b): two']);
  });
});
