/**
 * Docs center helpers (development-plan T-3.1 / G-10).
 * Pure logic — no VS Code imports. Runs `python docs/build.py` (host glue)
 * and locates the generated multi-language / multi-version HTML.
 */

export interface FcppMetaLike {
  doc_languages?: string[];
  doc_versions?: (number | string)[];
  graphviz_bin?: string;
}

/** Normalize a path for comparison (forward slashes, lower-case on Windows). */
export function normPath(p: string, platform: NodeJS.Platform = process.platform): string {
  let out = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (platform === 'win32') {
    out = out.toLowerCase();
  }
  return out;
}

export interface DocsOptions {
  languages: string[];
  versions: string[];
}

/** UI options derived from metadata.json (doc_languages / doc_versions). */
export function docsOptions(meta: FcppMetaLike): DocsOptions {
  const languages = Array.isArray(meta.doc_languages) ? meta.doc_languages.map((l) => String(l)) : [];
  const versions = Array.isArray(meta.doc_versions) ? meta.doc_versions.map((v) => String(v)) : [];
  return { languages, versions };
}

export interface GraphvizCheck {
  /** metadata.graphviz_bin points somewhere different from the detected dot dir. */
  mismatch: boolean;
  /** Current value stored in metadata. */
  current: string;
  /** Local value that would fix the mismatch. */
  expected: string;
  /** Human explanation for the banner. */
  reason: string;
}

/**
 * D-10: graphviz_bin is machine-specific. The template default is a POSIX
 * path (e.g. /usr/bin) that is wrong on Windows. We compare the stored value
 * against the directory of the detected `dot` executable.
 */
export function graphvizMismatch(
  meta: FcppMetaLike,
  dotExe: string | null,
  platform: NodeJS.Platform = process.platform,
): GraphvizCheck {
  const current = (meta.graphviz_bin ?? '').trim();
  if (!current) {
    return { mismatch: false, current: '', expected: '', reason: '未配置 graphviz_bin（文档构建使用 PATH 中的 dot）。' };
  }
  if (!dotExe) {
    return { mismatch: false, current, expected: '', reason: '本机未检测到 dot，无法对比路径。' };
  }
  const dotDir = dotExe.replace(/[\\/][^\\/]+$/, '');
  const expected = normPath(dotDir, platform);
  const cur = normPath(current, platform);
  const mismatch = cur !== expected;
  return {
    mismatch,
    current,
    expected: dotDir,
    reason: mismatch
      ? `graphviz_bin 配置为 ${current}，本机检测到 ${dotDir}（机器相关值不宜提交）。`
      : 'graphviz_bin 与本机 dot 路径一致。',
  };
}

/** Relative artifact patterns the docs pipeline can produce. */
export function artifactRoots(): { label: string; dir: string }[] {
  return [
    { label: 'Sphinx', dir: 'docs/sphinx/build' },
    { label: 'Doxygen', dir: 'docs/doxygen/build' },
  ];
}
