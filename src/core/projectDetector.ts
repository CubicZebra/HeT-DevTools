import { join } from 'node:path';
import { FcppMetadata, FcppProject, ProjectLevel } from '../types';
import { pathExists, readJson } from '../utils/fs';

/**
 * fcpp project detection (development-plan §1.5 / D-1).
 * Pure logic — no VS Code imports, fully unit-testable.
 *
 * L1 full   : metadata.json + conanfile.py + CMakeLists.txt
 * L2 partial: metadata.json only
 * L3 trace  : conandata.yml or .github/skills present (no metadata.json)
 */

export const PROJECT_MARKERS = {
  metadata: 'metadata.json',
  conanfile: 'conanfile.py',
  cmake: 'CMakeLists.txt',
  conandata: 'conandata.yml',
  skills: join('.github', 'skills'),
} as const;

/** Detect a single folder. Returns undefined when it is not an fcpp project. */
export async function detectFcppProject(root: string): Promise<FcppProject | undefined> {
  const hasMeta = await pathExists(join(root, PROJECT_MARKERS.metadata));
  const hasConanfile = await pathExists(join(root, PROJECT_MARKERS.conanfile));
  const hasCmake = await pathExists(join(root, PROJECT_MARKERS.cmake));
  const hasConandata = await pathExists(join(root, PROJECT_MARKERS.conandata));
  const hasSkills = await pathExists(join(root, PROJECT_MARKERS.skills));

  if (!hasMeta && !hasConandata && !hasSkills) {
    return undefined;
  }

  let level: ProjectLevel;
  if (hasMeta && hasConanfile && hasCmake) {
    level = 'full';
  } else if (hasMeta) {
    level = 'partial';
  } else {
    level = 'trace';
  }

  const project: FcppProject = { root, level };

  if (hasMeta) {
    try {
      project.metadata = await readJson<FcppMetadata>(join(root, PROJECT_MARKERS.metadata));
    } catch (err) {
      project.metadataError = (err as Error).message;
    }
  }

  return project;
}

/** Detect fcpp projects across several workspace roots (multi-root support). */
export async function detectProjectsIn(roots: readonly string[]): Promise<FcppProject[]> {
  const found: FcppProject[] = [];
  for (const root of roots) {
    const project = await detectFcppProject(root);
    if (project) {
      found.push(project);
    }
  }
  return found;
}
