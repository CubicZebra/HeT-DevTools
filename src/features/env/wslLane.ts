/**
 * V5-1: WSL2 managed build lane — component (real wsl.exe execution).
 *
 * `ensureWslLane` bootstraps the isolated lane once (idempotent, cached 60 s):
 * private venv (conan/cmake/ninja) + generated profile + private CONAN_HOME
 * under `~/.het-fti/managed-env`. `runWslConanCreate` then runs the canonical
 * `conan create .` inside the distro with Linux semantics, streaming output
 * exactly like the native lane and mapping `/mnt/<drive>/…` paths back to
 * Windows for the diagnostics parser.
 */
import { run } from '../../utils/exec';
import { decodeWslOutput, toWslPath, wslRunArgs } from '../../core/wslHost';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import type { BuildSummary } from '../../core/conanService';
import {
  wslLaneBuildCommand,
  wslLaneDocsEnsureCommand,
  wslLaneDocsRunCommand,
  wslLaneEnsureCommand,
  wslLaneLayout,
  wslLaneProfile,
  wslOutToWin,
} from '../../core/wslLane';

export interface WslLaneEnsureResult {
  home: string;
  note?: string;
}

let cache: { at: number; home: string; note?: string } | null = null;

// IMPORTANT: wsl.exe round-trips `bash -c/-lc <argv script>` through the
// Windows command line, which mangles multi-line/meta-char scripts (command
// substitutions break with a syntax error). ALWAYS run lane scripts from a
// file: write the script to a Windows temp path and `wsl.exe … -- bash <file>`
// (Linux side can read `/mnt/c/…` directly).
let scriptSeq = 0;
function writeWslTempScript(content: string): { win: string; wsl: string } {
  scriptSeq += 1;
  const win = join(tmpdir(), `het-lane-${process.pid}-${scriptSeq}.sh`);
  writeFileSync(win, content, 'utf8');
  return { win, wsl: toWslPath(win) };
}

/** Resolve the distro default user's $HOME (as the lane will run). */
async function distroHome(distro: string): Promise<string> {
  const r = await run('wsl.exe', wslRunArgs(distro, 'bash', ['-lc', 'printf %s "$HOME"']), {
    timeoutMs: 15_000,
  });
  if (r.code !== 0 || !decodeWslOutput(r.stdout).trim()) {
    throw new Error(`WSL 发行版 ${distro} 不可用（exit=${r.code}）`);
  }
  return decodeWslOutput(r.stdout).trim();
}

/**
 * Fast, NON-provisioning check that the lane venv already has conan (used by
 * the health/env sample — never bootstraps, just `test -x` on the venv bin).
 */
export async function laneConanPresent(distro: string): Promise<boolean> {
  try {
    const home = await distroHome(distro);
    const venvConan = `${wslLaneLayout(home).venv}/bin/conan`;
    const r = await run('wsl.exe', wslRunArgs(distro, 'bash', [`test -x "${venvConan}" && echo 1`]), {
      timeoutMs: 8000,
    });
    return r.code === 0 && /1/u.test(r.stdout);
  } catch {
    return false;
  }
}

/**
 * Idempotent bootstrap of the isolated lane. Cached 60 s (provisioning is
 * slow only the first time; afterwards it is a few `test -x`/`cat` calls).
 */
export async function ensureWslLane(distro: string): Promise<WslLaneEnsureResult> {
  if (cache && Date.now() - cache.at < 60_000) {
    return { home: cache.home, note: cache.note };
  }
  const home = await distroHome(distro);
  const cmd = wslLaneEnsureCommand(home, wslLaneProfile('Release'));
  const runEnsure = async (): Promise<Awaited<ReturnType<typeof run>>> => {
    const tmp = writeWslTempScript(cmd);
    try {
      return await run('wsl.exe', wslRunArgs(distro, 'bash', [tmp.wsl]), {
        timeoutMs: 15 * 60_000,
      });
    } finally {
      rmSync(tmp.win, { force: true });
    }
  };
  let r = await runEnsure();
  // Self-heal (all-in-one): the distro may lack `python3-venv` (Ubuntu ships
  // the module but not ensurepip). WSL root is passwordless by design — a
  // one-time, system-wide apt install of python3-venv fixes it WITHOUT
  // touching any conda env; then retry the user-level bootstrap.
  if (r.code === 3) {
    await run('wsl.exe', ['-d', distro, '-u', 'root', '--', 'bash', '-lc',
      'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq >/dev/null 2>&1 || true; apt-get install -y -qq python3-venv >/dev/null 2>&1 || true',
    ], { timeoutMs: 15 * 60_000 });
    r = await runEnsure();
  }
  if (r.code !== 0) {
    const tail = `${r.stdout}\n${r.stderr}`.split(/\r?\n/u).filter((s) => s.trim().length > 0).slice(-8).join('\n');
    throw new Error(`WSL 托管工具链准备失败（exit=${r.code}）：\n${tail}`);
  }
  cache = { at: Date.now(), home };
  return { home };
}

/**
 * Run `conan create .` inside the WSL2 managed lane and return a
 * conanService-compatible summary (Windows-mapped output for diagnostics).
 */
export async function runWslConanCreate(
  distro: string,
  cwdWin: string,
  opts: {
    buildType?: 'Debug' | 'Release';
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    timeoutMs?: number;
  } = {},
): Promise<BuildSummary> {
  const { home } = await ensureWslLane(distro);
  const cwdWsl = toWslPath(cwdWin);
  const cmd = wslLaneBuildCommand(cwdWsl, home, opts.buildType ?? 'Debug');
  const tmp = writeWslTempScript(cmd);
  let stdout = '';
  let stderr = '';
  try {
    const r = await run('wsl.exe', wslRunArgs(distro, 'bash', [tmp.wsl], cwdWsl), {
      timeoutMs: opts.timeoutMs ?? 0,
      onStdout: (c) => {
        stdout += c;
        opts.onStdout?.(c);
      },
      onStderr: (c) => {
        stderr += c;
        opts.onStderr?.(c);
      },
    });
    return { ok: r.code === 0, code: r.code, stdout: wslOutToWin(stdout), stderr: wslOutToWin(stderr) };
  } finally {
    rmSync(tmp.win, { force: true });
  }
}

let docsCache: { at: number; home: string } | null = null;

/** Root-level system packages the docs stack needs (idempotent, quiet). */
function aptDocsInstallArgs(distro: string): string[] {
  return ['-d', distro, '-u', 'root', '--', 'bash', '-lc',
    'export DEBIAN_FRONTEND=noninteractive; ' +
      'if ! command -v doxygen >/dev/null 2>&1 || ! command -v dot >/dev/null 2>&1 || ! command -v make >/dev/null 2>&1; then ' +
      'apt-get update -qq >/dev/null 2>&1 || true; apt-get install -y -qq doxygen graphviz make >/dev/null 2>&1 || true; fi',
  ];
}

/**
 * V5-4: ensure the lane DOCS stack — venv sphinx packages (pip, user) plus
 * system doxygen/graphviz/make (passwordless-root apt self-heal). Never
 * touches the distro's conda envs. Cached 60 s; throws with the output tail.
 */
export async function ensureWslDocs(distro: string): Promise<void> {
  if (docsCache && Date.now() - docsCache.at < 60_000) {
    return;
  }
  const home = await distroHome(distro);
  // System tools first (root self-heal when any is missing).
  await run('wsl.exe', aptDocsInstallArgs(distro), { timeoutMs: 15 * 60_000 });
  // Then the venv docs packages + report (user level).
  const cmd = wslLaneDocsEnsureCommand(home);
  const tmp = writeWslTempScript(cmd);
  try {
    const r = await run('wsl.exe', wslRunArgs(distro, 'bash', [tmp.wsl]), { timeoutMs: 20 * 60_000 });
    if (r.code !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.split(/\r?\n/u).filter((s) => s.trim().length > 0).slice(-8).join('\n');
      throw new Error(`WSL 文档工具链准备失败（exit=${r.code}）：\n${tail}`);
    }
    if (!/docs_sphinx:.+/.test(r.stdout) || !/docs_doxygen:.+/.test(r.stdout) || !/docs_dot:.+/.test(r.stdout) || !/docs_make:.+/.test(r.stdout)) {
      throw new Error(`WSL 文档工具未齐备：\n${r.stdout.slice(-800)}`);
    }
  } finally {
    rmSync(tmp.win, { force: true });
  }
  docsCache = { at: Date.now(), home };
}

/** V5-4: run `python docs/build.py` inside the lane (venv python + system tools). */
export async function runWslDocs(
  distro: string,
  cwdWin: string,
  opts: { onStdout?: (c: string) => void; onStderr?: (c: string) => void; timeoutMs?: number } = {},
): Promise<BuildSummary> {
  const { home } = await ensureWslLane(distro);
  await ensureWslDocs(distro);
  const cwdWsl = toWslPath(cwdWin);
  const cmd = wslLaneDocsRunCommand(cwdWsl, home);
  const tmp = writeWslTempScript(cmd);
  let stdout = '';
  let stderr = '';
  try {
    const r = await run('wsl.exe', wslRunArgs(distro, 'bash', [tmp.wsl], cwdWsl), {
      timeoutMs: opts.timeoutMs ?? 0,
      onStdout: (c) => {
        stdout += c;
        opts.onStdout?.(c);
      },
      onStderr: (c) => {
        stderr += c;
        opts.onStderr?.(c);
      },
    });
    return { ok: r.code === 0, code: r.code, stdout: wslOutToWin(stdout), stderr: wslOutToWin(stderr) };
  } finally {
    rmSync(tmp.win, { force: true });
  }
}
