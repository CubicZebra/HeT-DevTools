import * as assert from 'node:assert';
import { AuthSessionLike, GithubAuthService } from '../core/githubAuthService';

function session(label: string, scopes: string[] = ['repo']): AuthSessionLike {
  return { account: { id: label, label }, scopes };
}

function service(overrides: {
  vs?: AuthSessionLike | undefined;
  gh?: { loggedIn: boolean; username?: string };
}): GithubAuthService {
  return new GithubAuthService({
    scopes: ['repo', 'workflow', 'read:user'],
    getVsCodeSession: async () => overrides.vs,
    checkGh: async () => overrides.gh ?? { loggedIn: false },
  });
}

describe('GithubAuthService', () => {
  it('tier 1: returns VS Code session info with full capabilities', async () => {
    const info = await service({ vs: session('chen-zhang', ['repo', 'workflow', 'read:user']) }).resolve();
    assert.strictEqual(info.tier, 'vscode');
    assert.strictEqual(info.username, 'chen-zhang');
    assert.ok(info.capabilities.privateCIAccess);
    assert.ok(info.capabilities.createRepo);
  });

  it('tier 2: falls back to gh CLI when no VS Code session', async () => {
    const info = await service({ vs: undefined, gh: { loggedIn: true, username: 'cli-user' } }).resolve();
    assert.strictEqual(info.tier, 'gh');
    assert.strictEqual(info.username, 'cli-user');
    assert.ok(info.capabilities.privateCIAccess);
  });

  it('tier 3: anonymous when nothing is available', async () => {
    const info = await service({ vs: undefined, gh: { loggedIn: false } }).resolve();
    assert.strictEqual(info.tier, 'anonymous');
    assert.ok(!info.capabilities.privateCIAccess);
    assert.ok(!info.capabilities.createRepo);
  });

  it('tier 3: gh probe returning false never yields capabilities', async () => {
    const info = await service({ vs: undefined, gh: undefined }).resolve();
    assert.strictEqual(info.tier, 'anonymous');
    assert.ok(!info.capabilities.createRepo);
  });
});
