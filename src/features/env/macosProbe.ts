/**
 * V4-4 macOS Provider — host probe (darwin only).
 *
 * Reports whether the Xcode Command Line Tools + clang are present and the
 * Python available for the managed provisioner. Non-darwin hosts return null
 * (safe to call everywhere). All probing goes through real xcrun/xcode-select;
 * outputs are parsed by the pure helpers in core/clangToolchain.
 */
import { run } from '../../utils/exec';
import {
  MACOS_COVERAGE_NOTE,
  parseClangVersion,
  parseXcodeSelectOutput,
  parseXcrunFindOutput,
} from '../../core/clangToolchain';

export interface MacosLaneStatus {
  clt: boolean;
  devDir?: string;
  clang?: string;
  clangVersion?: string;
  python?: string;
  note: string;
}

let cache: { at: number; status: MacosLaneStatus } | null = null;

async function probe(): Promise<MacosLaneStatus> {
  const status: MacosLaneStatus = { clt: false, note: MACOS_COVERAGE_NOTE };
  try {
    const sel = await run('xcode-select', ['-p'], { timeoutMs: 6000 });
    status.devDir = parseXcodeSelectOutput(sel.stdout);
    status.clt = !!status.devDir;
  } catch {
    /* no CLT */
  }
  if (status.clt) {
    try {
      const find = await run('xcrun', ['--find', 'clang'], { timeoutMs: 6000 });
      status.clang = parseXcrunFindOutput(find.stdout);
    } catch {
      /* keep undefined */
    }
    if (status.clang) {
      try {
        const v = await run(status.clang, ['--version'], { timeoutMs: 6000 });
        status.clangVersion = parseClangVersion(v.stdout);
      } catch {
        /* keep undefined */
      }
    }
  }
  try {
    const py = await run('python3', ['--version'], { timeoutMs: 6000 });
    if (py.code === 0) {
      status.python = py.stdout.trim() || py.stderr.trim();
    }
  } catch {
    /* python missing — provisioner will report */
  }
  if (!status.clt) {
    status.note = '未检测到 Xcode Command Line Tools（需 xcode-select --install 一次）。';
  } else if (!status.clangVersion) {
    status.note = 'Xcode CLT 已装但 clang 版本解析失败。';
  } else {
    status.note = `Apple clang ${status.clangVersion} · ${MACOS_COVERAGE_NOTE}`;
  }
  return status;
}

export async function getMacosLaneStatus(force = false): Promise<MacosLaneStatus | null> {
  if (process.platform !== 'darwin') {
    return null;
  }
  if (!force && cache && Date.now() - cache.at < 60_000) {
    return cache.status;
  }
  const status = await probe();
  cache = { at: Date.now(), status };
  return status;
}
