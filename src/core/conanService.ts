import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { ExecResult, run, which } from '../utils/exec';
import { pathExists } from '../utils/fs';

/**
 * Conan 2 command service (development-plan T-1.6).
 * Locates the conan executable (override → PATH → common conda envs) and runs
 * the canonical local build command. Pure logic; no VS Code imports.
 */

export interface ConanLocationOptions {
  /** Absolute path override (extension setting, may be empty). */
  conanPath?: string;
  /** Extra candidate executable paths to try before conda scan. */
  extraCandidates?: string[];
}

export interface ConanRunOptions {
  buildType?: 'Debug' | 'Release';
  /** Cross-build host profile (e.g. 'arm_profile'); undefined = native. */
  profileHost?: string;
  buildMissing?: boolean;
  /** Conan --test-folder override; '' disables the test package step. */
  testFolder?: string | null;
  /** Extra -pr profile files appended (dev machine adaptations). */
  profiles?: string[];
  /** Additional raw args appended verbatim. */
  extraArgs?: string[];
}

export interface BuildSummary {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

function condaEnvScripts(): string[] {
  const exe = platform() === 'win32' ? 'conan.exe' : 'conan';
  const dirs: string[] = [];
  const roots = [join(homedir(), '.conda', 'envs'), 'C:/ProgramData/miniforge3/envs'];
  const baseScripts = ['C:/ProgramData/miniforge3/Scripts', join(homedir(), 'miniforge3', 'Scripts')];
  for (const root of roots) {
    let names: string[] = [];
    try {
      names = readdirSync(root);
    } catch {
      /* root missing */
    }
    for (const name of names) {
      dirs.push(join(root, name, 'Scripts', exe));
    }
  }
  for (const s of baseScripts) {
    dirs.push(join(s, exe));
  }
  return dirs;
}

/** Resolve the conan executable, or null when not found anywhere. */
export async function locateConan(options: ConanLocationOptions = {}): Promise<string | null> {
  const candidates = [
    options.conanPath ?? '',
    ...(options.extraCandidates ?? []),
  ];
  for (const c of candidates) {
    if (c && (await pathExists(c))) {
      return c;
    }
  }

  const fromPath = await which('conan');
  if (fromPath) {
    return fromPath;
  }

  for (const c of condaEnvScripts()) {
    if (await pathExists(c)) {
      return c;
    }
  }
  return null;
}

/** Build the canonical `conan create` argument list (see development-plan §9.1). */
export function conanCreateArgs(options: ConanRunOptions = {}): string[] {
  const args = ['create', '.'];
  if (options.profileHost) {
    args.push('-pr:b=default', `-pr:h=${options.profileHost}`);
  }
  const buildType = options.buildType ?? 'Debug';
  // Separate `-s` from its value: Conan 2 rejects a single combined token.
  args.push('-s', `build_type=${buildType}`);
  if (options.profiles) {
    for (const profile of options.profiles) {
      args.push('-pr', profile);
    }
  }
  if (options.buildMissing !== false) {
    args.push('--build=missing');
  }
  if (options.testFolder === '') {
    args.push('-tf=""');
  } else if (options.testFolder) {
    args.push(`-tf=${options.testFolder}`);
  }
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }
  return args;
}

/**
 * Run `conan create` in `cwd`. Resolves with a summary; does NOT throw on a
 * non-zero exit (failure is a normal build outcome).
 */
export async function runConanCreate(
  conanExe: string,
  cwd: string,
  options: ConanRunOptions = {},
  execOptions: { onStdout?: (c: string) => void; onStderr?: (c: string) => void; timeoutMs?: number } = {},
): Promise<BuildSummary> {
  let result: ExecResult;
  try {
    result = await run(conanExe, conanCreateArgs(options), {
      cwd,
      timeoutMs: execOptions.timeoutMs ?? 0,
      onStdout: execOptions.onStdout,
      onStderr: execOptions.onStderr,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: null, stdout: '', stderr: message };
  }
  return { ok: result.code === 0, code: result.code, stdout: result.stdout, stderr: result.stderr };
}
