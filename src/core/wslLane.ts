/**
 * V5-1: WSL2 managed build lane — pure helpers.
 *
 * The Windows "managed" toolchain lane runs `conan create` INSIDE a Linux
 * distro via wsl.exe: Linux semantics by construction (gcc + gcov/lcov, same
 * as Linux hosts), fully isolated from whatever the user has inside the distro
 * (conda base / FEniCS envs / other toolchains) by using a private venv under
 * `~/.het-fti/managed-env`, a private CONAN_HOME and a GENERATED (never
 * detected) conan profile.
 *
 * Pure module (no vscode): layout, command strings and output mapping — unit
 * testable. The wsl.exe execution layer lives in features/env/wslLane.
 */
import { posix } from 'node:path';
import { managedProfile } from './managedEnv';

/** Lane root & tools inside the distro's Linux home (ext4 — venv-safe). */
export interface WslLaneLayout {
  root: string;
  venv: string;
  conanHome: string;
  profilesDir: string;
  profile: string;
  marker: string;
}

/** Where the lane lives (always under `~/.het-fti/managed-env`). */
export function wslLaneLayout(home: string): WslLaneLayout {
  const root = posix.join(home, '.het-fti', 'managed-env');
  const conanHome = posix.join(root, 'conan2');
  const profilesDir = posix.join(conanHome, 'profiles');
  return {
    root,
    venv: posix.join(root, 'venv'),
    conanHome,
    profilesDir,
    profile: posix.join(profilesDir, 'default'),
    marker: posix.join(root, '.het-wsl-lane.json'),
  };
}

/** Canonical lane compiler (the managed gcc 13 semantic; see ToolchainManifest). */
export const WSL_CC = '/usr/bin/gcc-13';
export const WSL_CXX = '/usr/bin/g++-13';

/** Generated (never guessed) conan default profile for the lane. */
export function wslLaneProfile(buildType = 'Release'): string {
  return managedProfile(
    { cc: WSL_CC, cxx: WSL_CXX, version: '13', libcxx: 'libstdc++11' },
    'Linux',
    'x86_64',
    buildType,
  );
}

/**
 * Idempotent bootstrap script (runs as the distro's default user):
 *   1. mkdir lane/conan2/profiles
 *   2. create a private venv (prefers /usr/bin/python3, falls back to any
 *      python3/python on PATH — e.g. the user's conda base) and pip install
 *      conan/cmake/ninja into it (only when conan is missing)
 *   3. write the generated default profile (never detected)
 *   4. CONAN_HOME marker
 *   5. report lane tool versions (conan/cmake/gcc-13/lcov)
 * Never touches the user's conda envs: nothing is installed into base, no
 * `pip install --user`, no profile detection.
 */
export function wslLaneEnsureCommand(home: string, profileText: string): string {
  const l = wslLaneLayout(home);
  const venvBin = posix.join(l.venv, 'bin');
  const steps = [
    'set -e',
    `DIR="${l.root}"`,
    `mkdir -p "${l.profilesDir}"`,
    `if [ ! -x "${posix.join(venvBin, 'conan')}" ]; then`,
    '  PY=""',
    '  CONDA_PY=""',
    '  if command -v conda >/dev/null 2>&1; then CONDA_PY="$(dirname "$(command -v conda 2>/dev/null)")/python"; fi',
    '  for c in /usr/bin/python3 "$CONDA_PY" "$(command -v python3 2>/dev/null || true)" "$(command -v python 2>/dev/null || true)"; do',
    '    [ -n "$c" ] && [ -x "$c" ] || continue',
    '    if "$c" -m venv --help >/dev/null 2>&1 && "$c" -m venv "' + l.venv + '" >/dev/null 2>&1; then PY="$c"; break; fi',
    '    rm -rf "' + l.venv + '"',
    '  done',
    '  if [ -z "$PY" ]; then echo "FATAL: no python3 that can create venvs (install python3-venv via apt, or use a conda python)"; exit 3; fi',
    '  if [ ! -x "' + posix.join(venvBin, 'pip') + '" ]; then "' + posix.join(l.venv, 'bin', 'python') + '" -m ensurepip --upgrade >/dev/null 2>&1 || true; fi',
    `  "${posix.join(venvBin, 'pip')}" install --disable-pip-version-check -q "conan>=2.0,<3" "cmake>=4.0,<5" "ninja>=1.11"`,
    'fi',
    `cat > "${l.profile}" <<'HET_WSL_PROFILE'`,
    profileText,
    'HET_WSL_PROFILE',
    `touch "${posix.join(l.conanHome, '.conan_home_marker')}"`,
    `echo lane_conan:$(${posix.join(venvBin, 'conan')} --version 2>/dev/null | head -1 || echo -)`,
    `echo lane_cmake:$(${posix.join(venvBin, 'cmake')} --version 2>/dev/null | head -1 || echo -)`,
    'echo lane_gcc:$([ -x /usr/bin/gcc-13 ] && /usr/bin/gcc-13 --version | head -1 || echo -)',
    'echo lane_lcov:$([ -x /usr/bin/lcov ] && lcov --version | head -1 || echo -)',
  ];
  return steps.join('\n');
}

/** The `conan create` command inside the lane (runs from `cwdWsl`). */
export function wslLaneBuildCommand(cwdWsl: string, home: string, buildType = 'Debug'): string {
  const l = wslLaneLayout(home);
  return [
    'set -o pipefail',
    `export PATH="${posix.join(l.venv, 'bin')}:$PATH"`,
    `export CONAN_HOME="${l.conanHome}"`,
    'unset CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PROMPT_MODIFIER 2>/dev/null || true',
    `cd "${cwdWsl}"`,
    `conan create . -s build_type=${buildType} --build=missing`,
  ].join('\n');
}

/** V5-4: pip packages for the docs stack (loose pins, per the manifest). */
export const WSL_DOCS_PIP = ['"numpy>=1.26"', '"sphinx>=8,<9"', 'sphinx-intl', '"sphinx-rtd-theme>=2,<4"'];

/**
 * V5-4: idempotent docs-stack bootstrap inside the lane venv (runs as the
 * default user). System packages (doxygen/graphviz/make) are installed by the
 * host via passwordless root apt — never through the user's conda envs.
 */
export function wslLaneDocsEnsureCommand(home: string): string {
  const l = wslLaneLayout(home);
  const venvBin = posix.join(l.venv, 'bin');
  return [
    'set -e',
    `export PATH="${venvBin}:$PATH"`,
    `if [ ! -x "${posix.join(venvBin, 'sphinx-build')}" ]; then`,
    `  "${posix.join(venvBin, 'pip')}" install --disable-pip-version-check -q ${WSL_DOCS_PIP.join(' ')}`,
    'fi',
    `echo docs_sphinx:$([ -x "${posix.join(venvBin, 'sphinx-build')}" ] && sphinx-build --version | head -1 || echo -)`,
    'echo docs_doxygen:$([ -x /usr/bin/doxygen ] && doxygen --version || echo -)',
    'echo docs_dot:$([ -x /usr/bin/dot ] && dot -V 2>&1 | head -1 || echo -)',
    'echo docs_make:$([ -x /usr/bin/make ] && make --version | head -1 || echo -)',
  ].join('\n');
}

/** V5-4: `python docs/build.py` inside the lane (venv python + system tools). */
export function wslLaneDocsRunCommand(cwdWsl: string, home: string): string {
  const l = wslLaneLayout(home);
  return [
    'set -o pipefail',
    `export PATH="${posix.join(l.venv, 'bin')}:/usr/bin:/bin:$PATH"`,
    'unset CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PROMPT_MODIFIER 2>/dev/null || true',
    `cd "${cwdWsl}"`,
    'python docs/build.py',
  ].join('\n');
}

/**
 * Map WSL-side compiler paths back to Windows drive paths for the Problems
 * panel: `/mnt/c/Users/…/src/a.cpp` → `C:/Users/…/src/a.cpp`. Linux-only
 * paths (`/home/…`) and relative paths are left untouched.
 */
export function wslOutToWin(output: string): string {
  return output.replace(/\/mnt\/([a-zA-Z])\//g, (_m, drive: string) => `${drive.toUpperCase()}:/`);
}
