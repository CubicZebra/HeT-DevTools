/**
 * V4-3 Windows Provider (WSL2 lane) — pure helpers.
 *
 * The preferred Windows build lane runs inside a Linux distro via `wsl.exe`
 * (Linux semantics by construction, full gcov/lcov coverage). These helpers
 * stay pure (no vscode): Windows→WSL path mapping, `wsl -l -q` parsing, and
 * launcher argument assembly. Probes/status live in features/env/wslProbe.
 */

/** Distro name the provisioner creates when it owns the lane (V4-3/V4-8). */
export const MANAGED_DISTRO = 'het-fcpp';

/** Map a Windows path to its WSL `/mnt/<drive>/…` form (UNC not supported). */
export function toWslPath(p: string): string {
  const s = p.trim().replace(/\\/g, '/');
  if (!s) {
    return s;
  }
  // Already a Linux/WSL path.
  if (s.startsWith('/mnt/') || s.startsWith('/')) {
    return s;
  }
  const m = /^([a-zA-Z]):(?:\/(.*))?$/.exec(s);
  if (m) {
    const drive = m[1].toLowerCase();
    const rest = m[2] ? m[2] : '';
    return `/mnt/${drive}${rest ? `/${rest}` : ''}`;
  }
  // No drive letter (e.g. a bare share path): leave unchanged.
  return s;
}

/**
 * Parse `wsl.exe -l -q` output into distro names. Tolerates CRLF, a header
 * line, "(default)" markers and trailing blank lines.
 */
export function parseWslList(output: string): string[] {
  const names: string[] = [];
  for (const raw of output.split(/\r?\n/u)) {
    const line = raw.replace(/\s+$/u, '').trim();
    if (!line) {
      continue;
    }
    // -q may still print a header on some builds; skip obvious non-names.
    if (/windows subsystem|distributions|installed distributions|^\[/iu.test(line)) {
      continue;
    }
    const name = line.replace(/\s*\(default\)\s*$/iu, '').trim();
    if (name && !name.startsWith('-') && !name.includes(' ')) {
      names.push(name);
    }
  }
  return names;
}

/** Args for `wsl.exe` running `cmd` in `distro` (optionally under `cwdWsl`). */
export function wslRunArgs(distro: string, cmd: string, args: string[], cwdWsl?: string): string[] {
  const out: string[] = ['-d', distro];
  if (cwdWsl) {
    out.push('--cd', cwdWsl);
  }
  out.push('--', cmd, ...args);
  return out;
}

export interface WslToolSnapshot {
  gcc?: string;
  cmake?: string;
  conan?: string;
  lcov?: string;
}

/**
 * Parse the deterministic probe report emitted by wslProbe's command:
 *   gcc:13.3.0 | cmake:- | conan:2.32.0 | lcov:2.0-1   (one token per line)
 */
export function parseWslToolReport(output: string): WslToolSnapshot {
  const out: WslToolSnapshot = {};
  for (const raw of output.split(/\r?\n/u)) {
    const line = raw.trim();
    const m = /^([a-z]+):(.*)$/u.exec(line);
    if (!m) {
      continue;
    }
    const value = m[2].trim();
    if (!value || value === '-' || value === '?') {
      continue;
    }
    const key = m[1] as keyof WslToolSnapshot;
    if (key === 'gcc' || key === 'cmake' || key === 'conan' || key === 'lcov') {
      out[key] = value;
    }
  }
  return out;
}
