/**
 * V4-3 Windows Provider (WSL2 lane) — host probe.
 *
 * Lists distros (`wsl -l -q`) and snapshots the toolchain inside a chosen
 * distro via a deterministic probe command (parsed by core/wslHost). All calls
 * go through the real `wsl.exe`; results are cached 60 s. No downloads, no
 * sudo, no human interaction — pure capability report for the dashboard.
 */
import { run } from '../../utils/exec';
import { MANAGED_DISTRO, WslToolSnapshot, decodeWslOutput, parseWslList, parseWslToolReport } from '../../core/wslHost';
import { runWslScript } from './wslLane';

export interface WslLaneStatus {
  available: boolean;
  distro?: string;
  ready: boolean;
  tools: WslToolSnapshot;
  note?: string;
}

let cache: { at: number; status: WslLaneStatus } | null = null;

// NOTE: no `$(...)` here — wsl.exe round-trips a `bash -c/-lc` argv string and
// command substitutions get mangled (observed: syntax error at the `$(` line).
// Line-oriented `printf` + piping survives the round trip.
// System-level probe (gcc/lcov come from the distro itself).
const PROBE = [
  "printf 'gcc:'; gcc --version 2>/dev/null | head -1; echo",
  "printf 'lcov:'; lcov --version 2>/dev/null | head -1; echo",
].join(';');

// V5-6 (issue-1/3): conan/cmake are reported from the MANAGED LANE venv (the
// toolchain the extension actually uses for builds/docs), NOT from the
// distro base. The probe MUST go through the file transport — the previous
// inline `bash -lc '…"$lane/…"…'` was mangled by wsl.exe and returned "-" for
// both tools even when present (issue-3: HUD CMake ✗, conan fact false).

async function listDistros(): Promise<string[]> {
  try {
    const r = await run('wsl.exe', ['-l', '-q'], { timeoutMs: 8000 });
    if (r.code !== 0) {
      return [];
    }
    return parseWslList(decodeWslOutput(`${r.stdout}\n${r.stderr}`));
  } catch {
    return [];
  }
}

/** Probe one distro's system tools (gcc/lcov only). */
export async function probeDistroTools(distro: string): Promise<WslToolSnapshot> {
  try {
    const r = await run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', PROBE], { timeoutMs: 15000 });
    if (r.code !== 0) {
      return {};
    }
    return parseWslToolReport(decodeWslOutput(r.stdout));
  } catch {
    return {};
  }
}

/** Probe the managed lane venv conan/cmake (no provisioning — read only). */
export async function probeLaneTools(distro: string): Promise<{ conan?: string; cmake?: string }> {
  try {
    const script = [
      'P="$HOME/.het-fti/managed-env/venv/bin"',
      "printf 'conan:'; [ -x \"$P/conan\" ] && \"$P/conan\" --version 2>/dev/null | head -1 || echo -; echo",
      "printf 'cmake:'; [ -x \"$P/cmake\" ] && \"$P/cmake\" --version 2>/dev/null | head -1 || echo -; echo",
    ].join('\n');
    const r = await runWslScript(distro, script, 15_000);
    if (r.code !== 0) {
      return {};
    }
    return parseWslToolReport(decodeWslOutput(r.stdout));
  } catch {
    return {};
  }
}

/**
 * Overall lane status: prefer the managed distro, else the first available.
 * `tools.conan`/`tools.cmake` reflect the MANAGED LANE venv (used toolchain);
 * the distro's own base conan/cmake are deliberately NOT reported (they are
 * never used under managed semantics — issue-1 feedback).
 */
export async function getWslLaneStatus(force = false): Promise<WslLaneStatus> {
  if (!force && cache && Date.now() - cache.at < 60_000) {
    return cache.status;
  }
  const distros = await listDistros();
  const status: WslLaneStatus = { available: distros.length > 0, tools: {}, ready: false };
  if (!status.available) {
    status.note = '未检测到 WSL2 发行版（托管车道需要启用 WSL2：wsl --install -d Ubuntu-24.04；或设 metadata.toolchain=system）。';
    cache = { at: Date.now(), status };
    return status;
  }
  const chosen = distros.includes(MANAGED_DISTRO) ? MANAGED_DISTRO : distros[0];
  status.distro = chosen;
  const sys = await probeDistroTools(chosen);
  status.tools = { gcc: sys.gcc, lcov: sys.lcov };
  const lane = await probeLaneTools(chosen);
  if (lane.conan) {
    status.tools.conan = lane.conan;
  }
  if (lane.cmake) {
    status.tools.cmake = lane.cmake;
  }
  status.ready = !!sys.gcc;
  status.note = chosen === MANAGED_DISTRO ? '托管 distro（het-fcpp）' : `复用现有发行版 ${chosen}（gcc 系统级）`;
  if (!status.tools.conan || !status.tools.cmake) {
    status.note += ' · 托管车道 conan/cmake 未就绪（首次「构建并测试」将自动准备）';
  }
  cache = { at: Date.now(), status };
  return status;
}
