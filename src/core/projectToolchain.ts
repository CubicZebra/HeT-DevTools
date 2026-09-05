/**
 * V4-8 project toolchain semantics — pure metadata helpers.
 *
 * A project may declare which toolchain lane it is built with:
 *   - "managed": the extension's self-provisioned environment (default for new
 *                projects; deterministic, uninstall-clean).
 *   - "system":  an explicit user choice to use the machine's own toolchain
 *                (e.g. MSVC compatibility mode → coverage:none).
 * Pure parsing/rewriting of metadata.json text (JSON only, no comments).
 */

export const TOOLCHAIN_MANAGED = 'managed';
export const TOOLCHAIN_SYSTEM = 'system';
export type ProjectToolchain = 'managed' | 'system';

/** Read metadata.toolchain → 'managed' | 'system' | undefined. */
export function parseProjectToolchain(metaText: string): ProjectToolchain | undefined {
  try {
    const meta = JSON.parse(metaText) as Record<string, unknown>;
    const v = meta.toolchain;
    return v === TOOLCHAIN_MANAGED || v === TOOLCHAIN_SYSTEM ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Set metadata.toolchain and return the rewritten text (pretty-printed). */
export function withProjectToolchain(metaText: string, value: ProjectToolchain): string {
  const meta = JSON.parse(metaText) as Record<string, unknown>;
  meta.toolchain = value;
  return `${JSON.stringify(meta, null, 2)}\n`;
}

/** Human label for a toolchain semantic (or undefined → absent). */
export function projectToolchainLabel(v: ProjectToolchain | undefined): string {
  if (v === 'system') {
    return 'system（本机环境 · 兼容模式）';
  }
  if (v === 'managed') {
    return 'managed（扩展托管环境）';
  }
  return '未声明（按托管语义处理）';
}
