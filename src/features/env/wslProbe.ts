/**
 * V4-3 Windows Provider (WSL2 lane) — host probe.
 *
 * Lists distros (`wsl -l -q`) and snapshots the toolchain inside a chosen
 * distro via a deterministic probe command (parsed by core/wslHost). All calls
 * go through the real `wsl.exe`; results are cached 60 s. No downloads, no
 * sudo, no human interaction — pure capability report for the dashboard.
 */
import { run } from '../../utils/exec';
import { MANAGED_DISTRO, WslToolSnapshot, parseWslList, parseWslToolReport } from '../../core/wslHost';

export interface WslLaneStatus {
  available: boolean;
  distro?: string;
  ready: boolean;
  tools: WslToolSnapshot;
  note?: string;
}

let cache: { at: number; status: WslLaneStatus } | null = null;

const PROBE = [
  "echo gcc:$(gcc --version 2>/dev/null | head -1 || echo -)",
  "echo cmake:$(cmake --version 2>/dev/null | head -1 || echo -)",
  "echo conan:$(conan --version 2>/dev/null || echo -)",
  "echo lcov:$(lcov --version 2>/dev/null | head -1 || echo -)",
].join(';');

async function listDistros(): Promise<string[]> {
  try {
    const r = await run('wsl.exe', ['-l', '-q'], { timeoutMs: 8000 });
    if (r.code !== 0) {
      return [];
    }
    return parseWslList(`${r.stdout}\n${r.stderr}`);
  } catch {
    return [];
  }
}

/** Probe one distro: returns the tool snapshot (empty on failure). */
export async function probeDistroTools(distro: string): Promise<WslToolSnapshot> {
  try {
    const r = await run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', PROBE], { timeoutMs: 15000 });
    if (r.code !== 0) {
      return {};
    }
    return parseWslToolReport(r.stdout);
  } catch {
    return {};
  }
}

/** Overall lane status: prefer the managed distro, else the first available. */
export async function getWslLaneStatus(force = false): Promise<WslLaneStatus> {
  if (!force && cache && Date.now() - cache.at < 60_000) {
    return cache.status;
  }
  const distros = await listDistros();
  const status: WslLaneStatus = { available: distros.length > 0, tools: {}, ready: false };
  if (!status.available) {
    status.note = '未检测到 WSL2 发行版（Windows 上将回退 MinGW 车道）。';
    cache = { at: Date.now(), status };
    return status;
  }
  const chosen = distros.includes(MANAGED_DISTRO) ? MANAGED_DISTRO : distros[0];
  status.distro = chosen;
  status.tools = await probeDistroTools(chosen);
  status.ready = !!status.tools.gcc;
  status.note = chosen === MANAGED_DISTRO ? '托管 distro（het-fcpp）' : `复用现有发行版 ${chosen}（gcc 系统级）`;
  if (!status.tools.conan || !status.tools.cmake) {
    status.note += ' · conan/cmake 需托管安装后全自动（见「托管环境」）';
  }
  cache = { at: Date.now(), status };
  return status;
}
