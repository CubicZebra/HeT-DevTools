/**
 * V4-1 host adapter: gather REAL HostCapabilities (cheap, cached) and resolve
 * the current Provider decision. The decision core stays pure
 * (`core/provisionPlan`); this module only collects platform facts and honours
 * the `HET_FAKE_HOST` JSON override (tests / zero-manual harness simulate a
 * brand-new machine without touching the real one).
 */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { arch, platform } from 'node:os';
import { run } from '../../utils/exec';
import {
  HostCapabilities,
  ProvisionPrefs,
  ProviderDecision,
  parseFakeHost,
  providerLabel,
  resolveProviderDecision,
} from '../../core/provisionPlan';

let cached: { at: number; caps: HostCapabilities } | null = null;

/** True when `leaf` sits in any PATH directory (cheap fs scan). */
function pathHas(leaf: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter);
  return dirs.some((d) => d && existsSync(join(d, leaf)));
}

/** `wsl.exe -l -q` exit 0 + any output ⇒ at least one distro is ready. */
async function wslDefaultReady(): Promise<boolean> {
  try {
    const r = await run('wsl.exe', ['-l', '-q'], { timeoutMs: 4000 });
    if (r.code !== 0) {
      return false;
    }
    return r.stdout.trim().length > 0 || r.stderr.trim().length > 0;
  } catch {
    return false;
  }
}

async function detectCapabilities(): Promise<HostCapabilities> {
  const isWin = process.platform === 'win32';
  const base: HostCapabilities = {
    platform: platform(),
    arch: arch(),
    wslAvailable: isWin && pathHas('wsl.exe'),
    wslDefaultReady: false,
    virtualizationEnabled: false,
    isAdmin: isWin ? false : (process.getuid?.() ?? -1) === 0,
    msvcAvailable: isWin && (pathHas('cl.exe') || pathHas('cl')),
  };
  if (isWin && base.wslAvailable) {
    base.wslDefaultReady = await wslDefaultReady();
    // WSL2 answering implies the hypervisor is on (best effort).
    base.virtualizationEnabled = base.wslDefaultReady;
  }
  const fake = parseFakeHost(process.env.HET_FAKE_HOST);
  return { ...base, ...fake };
}

export async function getHostCapabilities(force = false): Promise<HostCapabilities> {
  if (!force && cached && Date.now() - cached.at < 30_000) {
    return cached.caps;
  }
  const caps = await detectCapabilities();
  cached = { at: Date.now(), caps };
  return caps;
}

export async function getCurrentProvisionPlan(force = false, prefs?: ProvisionPrefs): Promise<ProviderDecision> {
  const caps = await getHostCapabilities(force);
  return resolveProviderDecision(caps, prefs);
}

export { providerLabel, resolveProviderDecision };
