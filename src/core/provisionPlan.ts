/**
 * V4-1: Toolchain Manifest + capability probe → Provider decision (pure).
 *
 * Rework principle: instead of "sniff & reuse whatever the user has", a managed
 * build needs a *deterministic* toolchain. This module is the contract:
 *   - `TOOLCHAIN_MANIFEST` pins the canonical versions.
 *   - `HostCapabilities` describes ONLY the host's capabilities (platform,
 *     WSL2 availability, virtualization, disk, admin…), never tool versions.
 *   - `resolveProviderDecision(caps)` picks the Provider that guarantees the
 *     same build semantics per platform (Windows via WSL2 = Linux by
 *     construction, MinGW fallback, macOS clang).
 *
 * Pure logic (no `vscode`): fully unit-testable with injected capabilities and
 * the `HET_FAKE_HOST` JSON override used by both tests and the host adapter.
 */

export type ProviderId =
  | 'linux-native'
  | 'win-wsl2'
  | 'win-wsl2-pending'
  | 'win-wsl-required'
  | 'win-mingw'
  | 'macos-native'
  | 'unsupported';

export type CoverageSemantic = 'full' | 'partial' | 'none';

export interface ToolchainManifest {
  /** gcc-style toolchain (managed or WSL2/Linux system kernel). */
  gcc: string;
  /** clang (macOS system CLT). */
  clang: string;
  cmake: string;
  conan: string;
  ninja: string;
  python: string;
  lcov: string;
}

/** Canonical, version-pinned manifest (the ONLY source of truth for versions). */
export const TOOLCHAIN_MANIFEST: ToolchainManifest = {
  gcc: '13.2', // managed gcc toolchain (Linux/WSL2/MINGW)
  clang: '16', // macOS system CLT baseline
  cmake: '4.x', // pinned at provision time from the conan-required line
  conan: '2.x',
  ninja: '1.11+',
  python: '3.11+',
  lcov: '2.x',
};

export interface HostCapabilities {
  platform: NodeJS.Platform | string;
  arch: string;
  /** wsl.exe present and callable (Windows). */
  wslAvailable: boolean;
  /** A default WSL2 distro is ready to use. */
  wslDefaultReady: boolean;
  /** Virtualization enabled (best effort on Windows). */
  virtualizationEnabled: boolean;
  isAdmin: boolean;
  /** Free bytes on the storage drive (undefined = unknown). */
  diskFreeBytes?: number;
  /** VS Build Tools / MSVC present (Windows compatibility mode). */
  msvcAvailable: boolean;
}

export interface ProviderDecision {
  provider: ProviderId;
  /** Human reason (zh) shown on the dashboard env block. */
  reason: string;
  /** Coverage semantic this provider guarantees. */
  coverage: CoverageSemantic;
  /** The manifest slice this provider must satisfy. */
  manifest: ToolchainManifest;
  /** Extra human note (zh), e.g. how to upgrade to full semantics. */
  note: string;
}

const MAN = TOOLCHAIN_MANIFEST;

const PROVIDER_LABEL: Record<ProviderId, string> = {
  'linux-native': 'Linux 原生（gcc 自供）',
  'win-wsl2': 'Windows · WSL2 托管 distro（gcc + lcov 全语义）',
  'win-wsl2-pending': 'Windows · WSL2 已装但无发行版（需创建托管 distro）',
  'win-wsl-required': 'Windows · 需要启用 WSL2（或开启 MinGW 兼容）',
  'win-mingw': 'Windows · MinGW-w64 自供（可接受降级）',
  'macos-native': 'macOS 原生（clang + 自供 lcov）',
  unsupported: '暂不支持该平台',
};

export function providerLabel(id: ProviderId): string {
  return PROVIDER_LABEL[id];
}

/** Minimal free-disk guidance (MB) before we warn about provisioning. */
export const MIN_FREE_MB = 2048;

/**
 * Parse the `HET_FAKE_HOST` JSON override (tests + zero-manual harness simulate
 * "a brand new machine" by injecting capabilities). Returns a partial object to
 * merge over real detection.
 */
export function parseFakeHost(json?: string): Partial<HostCapabilities> {
  if (!json || !json.trim()) {
    return {};
  }
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out: Partial<HostCapabilities> = {};
    if (typeof raw.platform === 'string') {
      out.platform = raw.platform;
    }
    if (typeof raw.arch === 'string') {
      out.arch = raw.arch;
    }
    for (const k of ['wslAvailable', 'wslDefaultReady', 'virtualizationEnabled', 'isAdmin', 'msvcAvailable'] as const) {
      if (typeof raw[k] === 'boolean') {
        out[k] = raw[k];
      }
    }
    if (typeof raw.diskFreeBytes === 'number') {
      out.diskFreeBytes = raw.diskFreeBytes;
    }
    return out;
  } catch {
    return {};
  }
}

function lowDisk(caps: HostCapabilities): boolean {
  if (caps.diskFreeBytes === undefined) {
    return false;
  }
  return caps.diskFreeBytes < MIN_FREE_MB * 1024 * 1024;
}

/**
 * Provider preferences (user-configurable, defaults match the auto path).
 */
export interface ProvisionPrefs {
  /** MinGW fallback allowed when WSL2 is absent (het.env.allowMingw). */
  allowMingw?: boolean;
}

/**
 * Provider selection — deterministic, capability-first. Windows semantics:
 *   WSL2 present + distro ready → win-wsl2 (full, Linux-identical);
 *   WSL2 present but NO distro  → win-wsl2-pending (guide to create one —
 *                                 never silently degrade to MinGW);
 *   no WSL2 → win-mingw only when allowMingw (default true); else
 *             win-wsl-required (guide: enable WSL2 or open MinGW compat);
 *   MSVC is NEVER auto-chosen — only an explicit `toolchain: system` override
 *   (handled by the caller) routes to the MSVC compatibility mode.
 */
export function resolveProviderDecision(caps: HostCapabilities, prefs?: ProvisionPrefs): ProviderDecision {
  const allowMingw = prefs?.allowMingw !== false;
  if (caps.platform === 'linux') {
    return {
      provider: 'linux-native',
      reason: 'Linux：系统内核 + 自供 gcc 工具集（确定性版本）',
      coverage: 'full',
      manifest: MAN,
      note: lowDisk(caps) ? '磁盘空间偏低，准备环境可能需要 ≥2 GB。' : '覆盖率由 gcov/lcov 全量支持。',
    };
  }
  if (caps.platform === 'darwin') {
    return {
      provider: 'macos-native',
      reason: 'macOS：系统 clang + 自供 lcov/gcovr',
      coverage: 'full',
      manifest: MAN,
      note: lowDisk(caps) ? '磁盘空间偏低，准备环境可能需要 ≥2 GB。' : 'clang/gcc 差异由 Manifest 版本约束收敛。',
    };
  }
  if (caps.platform === 'win32') {
    if (caps.wslAvailable && caps.wslDefaultReady) {
      return {
        provider: 'win-wsl2',
        reason: 'Windows：经 WSL2 托管 distro（het-fcpp）执行，与 Linux 构造性同语义',
        coverage: 'full',
        manifest: MAN,
        note: caps.virtualizationEnabled
          ? '覆盖率由 WSL2 内 gcov/lcov 全量支持。'
          : '虚拟化未确认：WSL2 可能无法启动，将引导创建发行版。',
      };
    }
    if (caps.wslAvailable && !caps.wslDefaultReady) {
      // WSL exists but no distro: guide to create a managed one — do NOT
      // silently fall to MinGW here (the user only lacks a distribution).
      return {
        provider: 'win-wsl2-pending',
        reason: 'Windows：检测到 WSL2，但尚无可用发行版',
        coverage: 'partial',
        manifest: MAN,
        note: '在 dashboard「托管环境」执行「创建托管 distro het-fcpp」后即为 WSL2 全语义（gcc + lcov）。',
      };
    }
    if (!allowMingw) {
      return {
        provider: 'win-wsl-required',
        reason: 'Windows：无 WSL2，且 MinGW 兼容车道已关闭（het.env.allowMingw=false）',
        coverage: 'none',
        manifest: MAN,
        note: '请启用 WSL2（需要虚拟化，`wsl --install`），或在设置中开启 het.env.allowMingw 以使用 MinGW 兼容车道（覆盖率部分）。',
      };
    }
    return {
      provider: 'win-mingw',
      reason: 'Windows：无 WSL2，MinGW-w64 自供（可接受降级）',
      coverage: 'partial',
      manifest: MAN,
      note: caps.msvcAvailable
        ? '检测到 MSVC：可在项目 metadata 显式设 toolchain=system 走 MSVC 兼容模式（无覆盖率）。MinGW 兼容车道可用设置 het.env.allowMingw 关闭。'
        : '需要虚拟化/启用 WSL 才能获得完整覆盖率语义；当前 MinGW 提供 gcc 构建/测试（可用 het.env.allowMingw 关闭）。',
    };
  }
  return {
    provider: 'unsupported',
    reason: `平台 ${caps.platform} 暂不支持`,
    coverage: 'none',
    manifest: MAN,
    note: '请在 Linux / Windows / macOS 上使用。',
  };
}
