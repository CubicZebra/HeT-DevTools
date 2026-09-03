import * as assert from 'node:assert';
import { parseRemoteOrigin, parseWorkflowYaml } from '../core/ciStatus';

describe('ciStatus.parseRemoteOrigin', () => {
  it('parses https and ssh forms', () => {
    assert.deepStrictEqual(parseRemoteOrigin('https://github.com/HeT-FTI/fcpp.git'), { owner: 'HeT-FTI', repo: 'fcpp' });
    assert.deepStrictEqual(parseRemoteOrigin('git@github.com:HeT-FTI/fcpp.git'), { owner: 'HeT-FTI', repo: 'fcpp' });
    assert.deepStrictEqual(parseRemoteOrigin('https://github.com/o/r'), { owner: 'o', repo: 'r' });
  });
  it('returns null for non-github or empty', () => {
    assert.strictEqual(parseRemoteOrigin(''), null);
    assert.strictEqual(parseRemoteOrigin('git@gitlab.com:a/b.git'), null);
  });
});

describe('ciStatus.parseWorkflowYaml', () => {
  it('extracts name and on triggers (list form)', () => {
    const wf = parseWorkflowYaml(
      'ci-build-test.yml',
      `name: CI Build & Test
on:
  push:
    branches: [ main ]
  pull_request:
`,
    );
    assert.strictEqual(wf.name, 'CI Build & Test');
    assert.deepStrictEqual(wf.on, ['push', 'pull_request']);
  });
  it('handles inline on: push', () => {
    const wf = parseWorkflowYaml('x.yml', 'name: X\non: push\n');
    assert.deepStrictEqual(wf.on, ['push']);
  });
  it('falls back to filename when name missing', () => {
    const wf = parseWorkflowYaml('semver-release.yml', 'on:\n  push:\n    tags: ["v*"]\n');
    assert.strictEqual(wf.name, 'semver-release');
  });
});
