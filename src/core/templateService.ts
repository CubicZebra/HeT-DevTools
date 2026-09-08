import { TEMPLATE_LOCAL_PATH, TEMPLATE_REF, TEMPLATE_REPO, TEMPLATE_TAG } from './templateDefaults';

/**
 * Resolve the template origin used to bootstrap new fcpp projects (D-8).
 * Pure logic with injectable data access — no VS Code imports, fully testable.
 */

export type TemplateMode = 'remote' | 'local';

export interface TemplateSource {
  mode: TemplateMode;
  /** Remote https URL (mode = remote). */
  repo?: string;
  /** Tag or commit hash pinned by the maintainer (mode = remote). */
  ref?: string;
  /** Absolute local path (mode = local, maintainer dev/offline only). */
  localPath?: string;
}

export interface RemoteRelease {
  tag: string;
  prerelease: boolean;
  publishedAt?: string;
}

export interface RemoteVersionData {
  releases: RemoteRelease[];
  tags: string[];
}

/** Injectable data access so unit tests never touch the network. */
export interface TemplateServiceDeps {
  listRemoteVersions?: (repo: string) => Promise<RemoteVersionData>;
}

export type VersionPreference = 'recommended' | 'latest-release' | 'main';

export interface CloneDecision {
  /** git ref actually handed to `git clone --branch <cloneRef>`. */
  cloneRef: string;
  /** Human label for the UI (G-21). */
  label: string;
  /** true when tracking the moving main branch (risk hint in the UI). */
  isMain: boolean;
  /** true when the source is the maintainer's local dev copy. */
  isLocal: boolean;
}

export interface TemplateAnchor {
  /** git ref handed to `git clone --branch <ref>`. */
  ref: string;
  /** Human label for the UI/log (D-E3). */
  label: string;
}

/**
 * D-E3: maintainer-anchored bootstrap chain for the DEFAULT (recommended) path.
 * Order is fixed: TEMPLATE_TAG (official release) → TEMPLATE_REF (fixed hash).
 * The caller falls back to the bundled asset template when every anchor fails
 * (offline / unknown ref) — the third rung of the chain.
 * Local-mode sources return no remote anchors (they ARE the template).
 * `tag` is injectable so tests can simulate a future upstream release.
 */
export function recommendedAnchors(source: TemplateSource, tag = TEMPLATE_TAG): TemplateAnchor[] {
  if (source.mode !== 'remote') {
    return [];
  }
  const out: TemplateAnchor[] = [];
  if (tag) {
    out.push({ ref: tag, label: `推荐 · Release ${tag}` });
  }
  if (source.ref && source.ref !== tag) {
    const pretty = source.ref.length > 12 ? source.ref.slice(0, 12) : source.ref;
    out.push({ ref: source.ref, label: `推荐 · 锁定 ${pretty}` });
  }
  return out;
}

/** Build the source for a project bootstrap. Local override wins for dev/offline. */
export function resolveTemplateSource(localPathOverride = TEMPLATE_LOCAL_PATH): TemplateSource {
  if (localPathOverride) {
    return { mode: 'local', localPath: localPathOverride };
  }
  return { mode: 'remote', repo: TEMPLATE_REPO, ref: TEMPLATE_REF || undefined };
}

/**
 * Decide the actual clone ref from a user-visible preference.
 * - recommended   → the maintainer-pinned TEMPLATE_REF (tag or hash)
 * - latest-release→ newest stable release, else newest tag, else main
 * - main          → track upstream main (warned in the UI)
 */
export function resolveCloneRef(
  source: TemplateSource,
  preference: VersionPreference,
  remote?: RemoteVersionData,
): CloneDecision {
  if (source.mode === 'local') {
    return { cloneRef: 'HEAD', label: '本地模板副本（开发用）', isMain: false, isLocal: true };
  }
  if (preference === 'main') {
    return { cloneRef: 'main', label: 'main（跟随最新）', isMain: true, isLocal: false };
  }
  if (preference === 'latest-release') {
    const latest = remote?.releases.find((r) => !r.prerelease);
    if (latest) {
      return { cloneRef: latest.tag, label: `Release ${latest.tag}`, isMain: false, isLocal: false };
    }
    const headTag = remote?.tags[0];
    if (headTag) {
      return { cloneRef: headTag, label: `Tag ${headTag}`, isMain: false, isLocal: false };
    }
    return { cloneRef: 'main', label: 'main（上游暂无 Release）', isMain: true, isLocal: false };
  }
  // recommended → maintainer pin
  if (source.ref) {
    const pretty = source.ref.length > 12 ? source.ref.slice(0, 12) : source.ref;
    return { cloneRef: source.ref, label: `推荐 · 锁定 ${pretty}`, isMain: false, isLocal: false };
  }
  return { cloneRef: 'main', label: 'main（未锁定）', isMain: true, isLocal: false };
}

/** Fetch remote version data through the injected accessor (offline-safe). */
export async function listRemoteVersions(deps: TemplateServiceDeps, repo: string): Promise<RemoteVersionData> {
  if (!deps.listRemoteVersions) {
    return { releases: [], tags: [] };
  }
  return deps.listRemoteVersions(repo);
}
