import * as assert from 'node:assert';
import { detectToolchain, versionMeetsRequirement } from '../core/toolchainDetector';

describe('toolchainDetector.versionMeetsRequirement', () => {
  it('compares major versions', () => {
    assert.strictEqual(versionMeetsRequirement('2.9.3', '>= 2'), true);
    assert.strictEqual(versionMeetsRequirement('1.9.3', '>= 2'), false);
  });

  it('compares minors when required has one', () => {
    assert.strictEqual(versionMeetsRequirement('3.28.1', '>= 3.28'), true);
    assert.strictEqual(versionMeetsRequirement('3.27.0', '>= 3.28'), false);
  });

  it('no requirement or unknown version is always ok', () => {
    assert.strictEqual(versionMeetsRequirement(undefined, '>= 2'), true);
    assert.strictEqual(versionMeetsRequirement('abc', '>= 2'), true);
    assert.strictEqual(versionMeetsRequirement('2.0.0', undefined), true);
  });
});

describe('toolchainDetector.detectToolchain', () => {
  it('detects git as ok (git exists on dev machines)', async () => {
    const tools = await detectToolchain([{ name: 'git', versionArgs: ['--version'] }]);
    const git = tools.git;
    assert.ok(git);
    assert.strictEqual(git.state, 'ok');
    assert.ok(git.foundPath, 'git should be resolvable');
    assert.ok((git.version ?? '').length > 0);
  });

  it('marks unknown tools as missing', async () => {
    const tools = await detectToolchain([{ name: 'definitely-not-a-real-tool-xyz' }]);
    assert.strictEqual(tools['definitely-not-a-real-tool-xyz'].state, 'missing');
  });

  it('flags a version below the requirement as versionMismatch', async () => {
    const tools = await detectToolchain([{ name: 'node', versionArgs: ['--version'], required: '>= 99' }]);
    const node = tools.node;
    assert.ok(node);
    assert.strictEqual(node.state, 'versionMismatch');
  });
});
