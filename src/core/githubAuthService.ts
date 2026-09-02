import { run } from '../utils/exec';

/**
 * GitHub identity with a three-tier fallback (development-plan §9.6 / D-9):
 *   1. VS Code built-in GitHub session (vscode.authentication)
 *   2. gh CLI (already logged in → reuse, zero prompts)
 *   3. anonymous (public read-only)
 *
 * This module is pure logic: VS Code session access is injected so the class is
 * unit-testable without the extension host. `createGhAuthChecker` is a real,
 * dependency-free `gh auth status` probe usable from the host too.
 */

export type AuthTier = 'vscode' | 'gh' | 'anonymous';

export interface AuthSessionLike {
  account: { id: string; label: string };
  scopes: readonly string[];
}

export interface GhStatusResult {
  loggedIn: boolean;
  username?: string;
}

export interface AuthCapabilities {
  /** Private repos CI / rerun+trigger workflows / download artifacts. */
  privateCIAccess: boolean;
  /** Create a GitHub repository during project init. */
  createRepo: boolean;
}

export interface AuthInfo {
  tier: AuthTier;
  username?: string;
  scopes?: readonly string[];
  capabilities: AuthCapabilities;
  /** Short UI banner hint (G-22). */
  hint: string;
}

export interface GithubAuthDeps {
  /** Resolve the VS Code GitHub session; undefined when not signed in. */
  getVsCodeSession?: () => Promise<AuthSessionLike | undefined>;
  /** Probe `gh auth status`; undefined when gh is unavailable. */
  checkGh?: () => Promise<GhStatusResult>;
  /** Scopes requested from the VS Code built-in provider. */
  scopes: string[];
}

/** Scopes needed for the "full" capability tier. */
export const REQUIRED_SCOPES = ['repo', 'workflow', 'read:user'];

export class GithubAuthService {
  constructor(private readonly deps: GithubAuthDeps) {}

  async resolve(): Promise<AuthInfo> {
    // Tier 1 — VS Code built-in GitHub session.
    const vs = this.deps.getVsCodeSession ? await this.deps.getVsCodeSession() : undefined;
    if (vs) {
      return {
        tier: 'vscode',
        username: vs.account.label,
        scopes: vs.scopes,
        capabilities: { privateCIAccess: true, createRepo: true },
        hint: `已登录（VS Code 账户）：${vs.account.label}`,
      };
    }

    // Tier 2 — gh CLI already authenticated (zero prompts).
    const gh = this.deps.checkGh ? await this.deps.checkGh() : undefined;
    if (gh && gh.loggedIn) {
      return {
        tier: 'gh',
        username: gh.username,
        capabilities: { privateCIAccess: true, createRepo: true },
        hint: `已登录（gh CLI）：${gh.username ?? 'unknown'}`,
      };
    }

    // Tier 3 — anonymous, public read-only.
    return {
      tier: 'anonymous',
      capabilities: { privateCIAccess: false, createRepo: false },
      hint: '匿名模式：公开仓库只读，私有仓库与触发功能需登录',
    };
  }
}

/** Probe `gh auth status` without any VS Code dependency. */
export function createGhAuthChecker(): () => Promise<GhStatusResult> {
  return async () => {
    try {
      const res = await run('gh', ['auth', 'status'], { timeoutMs: 10_000 });
      const text = `${res.stdout}\n${res.stderr}`;
      const loggedIn = res.code === 0 && /Logged in to github\.com/i.test(text);
      const m = /Logged in to github\.com as\s+(\S+)/i.exec(text);
      return { loggedIn, username: m?.[1] };
    } catch {
      return { loggedIn: false };
    }
  };
}
