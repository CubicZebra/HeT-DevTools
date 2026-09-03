/**
 * Benchmark helpers (development-plan T-4.1 / G-14).
 * Pure logic — no VS Code imports.
 *
 * Wraps `python benchmark/script/run_bench.py [--no-flash]`, parses the
 * BENCHMARK_START / RESULT|<case>|<value> / BENCHMARK_END UART protocol and
 * edits bench_config.json field-by-field without destroying the template's
 * comments / formatting.
 */

export interface BenchCase {
  name: string;
  value: number;
}

export interface BenchParse {
  started: boolean;
  ended: boolean;
  cases: BenchCase[];
  /** True when START/END both seen; still reports partial cases otherwise. */
  complete: boolean;
}

const RESULT_RE = /^RESULT\|([^|\r\n]+)\|(\d+)$/;

export function parseBenchmarkProtocol(text: string): BenchParse {
  const cases: BenchCase[] = [];
  let started = false;
  let ended = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === 'BENCHMARK_START') {
      started = true;
      continue;
    }
    if (line === 'BENCHMARK_END') {
      ended = true;
      continue;
    }
    const m = RESULT_RE.exec(line);
    if (m && started && !ended) {
      cases.push({ name: m[1], value: Number(m[2]) });
    }
  }
  return { started, ended, cases, complete: started && ended };
}

/* ------------------------------------------------------------------ *
 * bench_config.json field model + comment-preserving line editing
 * ------------------------------------------------------------------ */

export interface BenchField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'list' | 'bool';
  hint?: string;
}

export const BENCH_FIELDS_M: BenchField[] = [
  { key: 'target_mcu', label: 'MCU (Cortex-M)', type: 'text', hint: '如 cortex-m0 / cortex-m4f' },
  { key: 'float_abi', label: '浮点 ABI', type: 'text' },
  { key: 'fpu', label: 'FPU', type: 'text', hint: '无核填 none' },
  { key: 'algo_flash_origin', label: '算法 Flash 地址', type: 'text' },
  { key: 'algo_ram_origin', label: '算法 RAM 地址', type: 'text' },
  { key: 'compiler_version', label: '编译器版本', type: 'text' },
  { key: 'toolchain_package_version', label: 'arm-toolchain 版本', type: 'text' },
  { key: 'extra_cflags', label: '额外编译参数', type: 'list' },
  { key: 'flash_tool', label: '烧录工具', type: 'text', hint: 'jlink / openocd / pyocd' },
  { key: 'jlink_device', label: 'JLink 器件', type: 'text' },
  { key: 'jlink_speed', label: 'JLink 速度 (kHz)', type: 'text' },
  { key: 'openocd_interface', label: 'OpenOCD 接口 cfg', type: 'text' },
  { key: 'openocd_target', label: 'OpenOCD 目标 cfg', type: 'text' },
  { key: 'serial_port', label: '串口', type: 'text' },
  { key: 'serial_baud', label: '波特率', type: 'text' },
  { key: 'timeout', label: '超时 (s)', type: 'text' },
];

export const BENCH_FIELDS_A: BenchField[] = [
  { key: 'target_os', label: '目标 OS', type: 'text' },
  { key: 'target_cpu', label: 'CPU (Cortex-A)', type: 'text' },
  { key: 'float_abi', label: '浮点 ABI', type: 'text' },
  { key: 'fpu', label: 'FPU', type: 'text' },
  { key: 'extra_cflags', label: '额外编译参数', type: 'list' },
  { key: 'compiler_version', label: '编译器版本', type: 'text' },
  { key: 'toolchain_package_version', label: 'arm-toolchain 版本', type: 'text' },
  { key: 'deploy_tool', label: '部署工具', type: 'text', hint: 'adb / ssh' },
  { key: 'remote_path', label: '远端路径', type: 'text' },
  { key: 'ssh_host', label: 'SSH 主机', type: 'text' },
  { key: 'timeout', label: '超时 (s)', type: 'text' },
];

export type BenchPlatform = 'm' | 'a' | 'unknown';

/** Guess platform from parsed config keys (M-core vs A-core). */
export function configPlatform(cfg: Record<string, unknown>): BenchPlatform {
  if (typeof cfg.target_mcu === 'string' && /cortex-m/i.test(cfg.target_mcu)) {
    return 'm';
  }
  if (typeof cfg.target_cpu === 'string' || (cfg as { target_os?: string }).target_os) {
    return 'a';
  }
  return 'unknown';
}

export function fieldsFor(platform: BenchPlatform): BenchField[] {
  return platform === 'm' ? BENCH_FIELDS_M : platform === 'a' ? BENCH_FIELDS_A : [];
}

/** Serialize a field value into JSON literal text. */
export function jsonValueText(v: unknown): string {
  if (Array.isArray(v)) {
    return '[' + v.map((x) => JSON.stringify(String(x))).join(', ') + ']';
  }
  return JSON.stringify(v);
}

/**
 * Replace a single top-level key's value in a JSON(C) text, line-wise, keeping
 * every other line (comments, blank lines, indentation) intact.
 * Returns { ok, text, error }.
 */
export function replaceJsoncField(text: string, key: string, value: unknown): { ok: boolean; text: string; error?: string } {
  const lines = text.split(/\r?\n/);
  const keyRe = new RegExp(`^([ \\t]*)("${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")([ \\t]*):([ \\t]*)(.*?)(,?)[ \\t]*$`);
  let hit = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = keyRe.exec(lines[i]);
    if (m) {
      // skip lines that look like a comment-only remainder after value? (jsonc trailing comments preserved)
      hit = i;
      const comma = m[6];
      lines[i] = `${m[1]}${m[2]}${m[3]}:${m[4]}${jsonValueText(value)}${comma}`;
      break;
    }
  }
  if (hit === -1) {
    return { ok: false, text, error: `bench_config.json 中找不到字段 "${key}"（保留原文件不动）。` };
  }
  return { ok: true, text: lines.join('\n') };
}
