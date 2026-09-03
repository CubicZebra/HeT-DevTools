import { readdirSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { homedir, platform } from 'node:os';
import { pathExists } from '../utils/fs';

/**
 * Conda environment sniffing (V2 follow-up: "environment completeness").
 *
 * VS Code on Windows starts with a plain PowerShell PATH — conan, cmake and
 * friends live inside a conda env (here: miniforge `build`). This module
 * discovers the conda root/env containing conan and builds a PATH prefix so
 * spawned toolchains behave exactly like an activated env, with zero user
 * setup. Pure logic (fs/os only) — unit-testable with fake roots.
 */

export interface CondaConanRuntime {
  /** Absolute conan executable. */
  exe: string;
  /** The env directory (root for `base`). */
  envDir: string;
  /** Env name ('base' when conan sits in the root env). */
  envName: string;
  /** Conda root directory. */
  root: string;
  /** PATH prefix that emulates `conda activate <env>` for child processes. */
  pathPrefix: string;
}

export interface CondaDiscoveryOptions {
  /** Candidate conda roots (defaults to the well-known set). */
  roots?: string[];
  /** Preferred env names, in order (first hit wins regardless of fs order). */
  preferEnvNames?: string[];
  /** Include the root/base env as a candidate. */
  includeBase?: boolean;
}

export function defaultCondaRoots(): string[] {
  const home = homedir();
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates: string[] = [];
  // Explicit environment hints first (fast path when running inside a conda
  // terminal, or when CONDA_EXE is set).
  if (process.env.CONDA_EXE) {
    candidates.push(dirname(dirname(process.env.CONDA_EXE)));
  }
  if (process.env.MAMBA_ROOT_PREFIX) {
    candidates.push(process.env.MAMBA_ROOT_PREFIX);
  }
  if (process.env.CONDA_PREFIX) {
    candidates.push(dirname(process.env.CONDA_PREFIX)); // env dir's parent = root (or root itself)
  }
  for (const name of ['miniforge3', 'miniconda3', 'anaconda3']) {
    candidates.push(join(home, name));
  }
  candidates.push(join(home, '.conda'), join(home, 'AppData', 'Local', 'miniconda3'));
  if (local) {
    candidates.push(join(local, 'miniconda3'), join(local, 'miniforge3'));
  }
  for (const name of ['miniforge3', 'miniconda3', 'anaconda3', 'Anaconda3']) {
    candidates.push(join('C:/ProgramData', name));
  }
  candidates.push('C:/tools/miniconda3');
  return candidates;
}

const DEFAULT_PREFER = ['build', 'fcpp', 'dev', 'het', 'base'];

function winPrefixes(envDir: string, root: string): string[] {
  return [
    join(envDir, 'Scripts'),
    join(envDir, 'Library', 'bin'),
    join(envDir, 'Library', 'mingw-w64', 'bin'),
    join(root, 'condabin'),
    join(root, 'Scripts'),
    join(root, 'Library', 'bin'),
  ];
}

function posixPrefixes(envDir: string, root: string): string[] {
  return [join(envDir, 'bin'), join(root, 'condabin'), join(root, 'bin')];
}

function isWindows(): boolean {
  return platform() === 'win32';
}

/** Derive a runtime from a conan exe path that already lives inside conda. */
export function runtimeFromExePath(exe: string): CondaConanRuntime | undefined {
  if (!/(conda|miniconda|miniforge|anaconda)/i.test(exe)) {
    return undefined;
  }
  const scriptsDir = dirname(exe); // .../Scripts (win) or .../bin
  const envDir = dirname(scriptsDir); // <root>/envs/<name> or <root>
  if (dirname(envDir).split(/[\\/]/).pop() === 'envs') {
    // exe = <root>/envs/<name>/Scripts|bin/conan
    const root = dirname(dirname(envDir));
    return buildRuntime(exe, envDir, envDir.split(/[\\/]/).pop() ?? 'env', root);
  }
  // base env: exe = <root>/Scripts|bin/conan
  return buildRuntime(exe, envDir, 'base', envDir);
}

function buildRuntime(exe: string, envDir: string, envName: string, root: string): CondaConanRuntime {
  const parts = isWindows() ? winPrefixes(envDir, root) : posixPrefixes(envDir, root);
  return { exe, envDir, envName, root, pathPrefix: parts.join(delimiter) };
}

function rank(name: string, prefer: string[]): number {
  const idx = prefer.indexOf(name);
  return idx >= 0 ? idx : prefer.length;
}

/** Discover the conda env providing conan, or null. */
export async function discoverConanRuntime(opts: CondaDiscoveryOptions = {}): Promise<CondaConanRuntime | null> {
  const win = isWindows();
  const exeName = win ? 'conan.exe' : 'conan';
  const scriptsRel = win ? ['Scripts'] : ['bin'];
  const prefer = opts.preferEnvNames ?? DEFAULT_PREFER;
  const roots = [...new Set(opts.roots ?? defaultCondaRoots())].filter(Boolean);

  interface Hit {
    envDir: string;
    envName: string;
    root: string;
    exe: string;
  }
  const hits: Hit[] = [];

  for (const root of roots) {
    if (opts.includeBase !== false) {
      for (const s of scriptsRel) {
        const exe = join(root, s, exeName);
        if (await pathExists(exe)) {
          hits.push({ envDir: root, envName: 'base', root, exe });
        }
      }
    }
    const envsRoot = join(root, 'envs');
    let names: string[] = [];
    try {
      names = readdirSync(envsRoot).filter((n) => !n.startsWith('.'));
    } catch {
      /* no envs dir */
    }
    for (const name of names) {
      for (const s of scriptsRel) {
        const exe = join(envsRoot, name, s, exeName);
        if (await pathExists(exe)) {
          hits.push({ envDir: join(envsRoot, name), envName: name, root, exe });
        }
      }
    }
  }

  hits.sort((a, b) => rank(a.envName, prefer) - rank(b.envName, prefer) || a.envName.localeCompare(b.envName));
  const hit = hits[0];
  return hit ? buildRuntime(hit.exe, hit.envDir, hit.envName, hit.root) : null;
}
