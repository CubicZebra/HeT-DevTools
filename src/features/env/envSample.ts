/**
 * V5-2B single environment sample — ONE source of truth for the chip hover
 * "开发环境" row, the HUD and the cockpit env view (no second, sniffed view).
 *
 * Gathers the Provider decision + managed-env state + WSL/macOS lane snapshot
 * into one object with a short `summary` line and a `conan` readiness fact for
 * the health check. Calls go through the real probe modules (cached there).
 */
import { getCurrentProvisionPlan } from './provisionHost';
import { currentManagedStatus } from './managedProvisioner';
import { getWslLaneStatus } from './wslProbe';
import { getMacosLaneStatus } from './macosProbe';
import { laneConanPresent } from './wslLane';
import { providerLabel } from '../../core/provisionPlan';
import type { ManagedState } from '../../core/managedEnv';

export interface EnvSample {
  providerId: string | null;
  providerLabel: string;
  coverage: 'full' | 'partial' | 'none' | '';
  reason?: string;
  managed: { state: ManagedState; tools: Record<string, string>; note?: string } | null;
  wsl: { distro?: string; ready: boolean; tools: Record<string, string>; note?: string } | null;
  osx: { clt: boolean; clangVersion?: string; python?: string; note?: string } | null;
  /** conan readiness: true/false under managed semantics; null = system sniff. */
  conan: boolean | null;
  /** One short line for the hover "开发环境" row (no long runtime details). */
  summary: string;
}

/** Compact human line from a sample (pure — unit tested). */
export function envSummaryOf(s: Pick<EnvSample, 'providerId' | 'providerLabel' | 'wsl' | 'managed' | 'osx'>): string {
  const wslTools = s.wsl?.tools ?? {};
  if (s.wsl?.ready) {
    const bits = ['WSL2'];
    if (s.wsl.distro) {
      bits.push(s.wsl.distro);
    }
    if (wslTools.conan) {
      bits.push(`conan ${wslTools.conan}`);
    }
    if (wslTools.gcc) {
      bits.push(`gcc ${wslTools.gcc.split(' ')[0]}`);
    }
    return bits.join(' · ');
  }
  if (s.managed && s.managed.state === 'ready') {
    const t = s.managed.tools;
    return `托管环境${t.conan ? ` · conan ${t.conan}` : ''}${t.cmake ? ` · cmake ${t.cmake}` : ''}`;
  }
  if (s.osx && s.osx.clt) {
    return `macOS · CLT${s.osx.clangVersion ? ` · clang ${s.osx.clangVersion}` : ''}`;
  }
  if (s.providerLabel) {
    return s.providerLabel;
  }
  return '环境未检测';
}

/**
 * V5-2B: conan readiness fact for the health check. Under managed semantics on
 * Windows it reflects the real lane (venv conan exists / pending distro);
 * otherwise (native system / linux / macos) it returns null so health falls
 * back to system sniffing.
 */
export async function envConanFact(): Promise<{ conan?: boolean } | undefined> {
  if (process.platform !== 'win32') {
    return undefined;
  }
  const plan = await getCurrentProvisionPlan(false).catch(() => null);
  if (!plan || plan.provider === 'win-mingw') {
    return undefined; // native fallback: system conan decides
  }
  if (plan.provider === 'win-wsl2-pending') {
    return { conan: false };
  }
  if (plan.provider === 'win-wsl2') {
    const wsl = await getWslLaneStatus(false).catch(() => null);
    if (!wsl?.distro) {
      return { conan: false };
    }
    return { conan: await laneConanPresent(wsl.distro).catch(() => false) };
  }
  return undefined;
}

/** Assemble the full sample (component — uses cached real probes). */
export async function collectEnvSample(storageRoot: string): Promise<EnvSample> {
  const plan = await getCurrentProvisionPlan(false).catch(() => null);
  const managed = storageRoot ? currentManagedStatus(storageRoot, process.platform === 'win32') : null;
  const isWinWsl = process.platform === 'win32' && (plan?.provider === 'win-wsl2' || plan?.provider === 'win-wsl2-pending');
  const wsl = isWinWsl ? await getWslLaneStatus(false).catch(() => null) : null;
  const osx = process.platform === 'darwin' && plan?.provider === 'macos-native' ? await getMacosLaneStatus(false).catch(() => null) : null;
  const sample: EnvSample = {
    providerId: plan?.provider ?? null,
    providerLabel: plan ? providerLabel(plan.provider) : '',
    coverage: plan?.coverage ?? '',
    reason: plan?.reason,
    managed:
      managed && managed.state !== 'absent'
        ? { state: managed.state, tools: managed.tools ?? {}, note: managed.note }
        : null,
    wsl: wsl && wsl.available ? { distro: wsl.distro, ready: wsl.ready, tools: (wsl.tools ?? {}) as Record<string, string>, note: wsl.note } : null,
    osx: osx ? { clt: osx.clt, clangVersion: osx.clangVersion, python: osx.python, note: osx.note } : null,
    conan: null,
    summary: '',
  };
  sample.conan = (await envConanFact().catch(() => undefined))?.conan ?? null;
  sample.summary = envSummaryOf(sample);
  return sample;
}
