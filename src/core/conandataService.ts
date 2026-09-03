/**
 * conandata.yml line editor (development-plan T-2.3).
 * Pure text editing that preserves the header comment and the original line
 * style — no YAML runtime dependency needed for the requirements list shape
 * that fcpp uses:
 *
 *   # This file is managed by Conan, contents will be overwritten. ...
 *   requirements:
 *     - "gtest/1.16.0"
 *     - "pybind11/3.0.1"
 */

export interface RequirementLine {
  /** Full trimmed line including leading `- `. */
  line: string;
  pkg: string;
  version?: string;
}

export const REQUIREMENT_RE = /^(\s*-\s*)["']?([^/"' ]+)\/([^"' ]*)["']?\s*$/;

/** Parse the requirement entries out of a conandata.yml body. */
export function parseRequirements(text: string): RequirementLine[] {
  const out: RequirementLine[] = [];
  let inRequirements = false;
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (/^requirements:\s*$/.test(trimmed)) {
      inRequirements = true;
      continue;
    }
    if (inRequirements) {
      const m = REQUIREMENT_RE.exec(trimmed);
      if (m) {
        out.push({ line: raw, pkg: m[2], version: m[3] || undefined });
        continue;
      }
      if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        break; // left the requirements block
      }
    }
  }
  return out;
}

/** Render a requirement line using the fcpp canonical style. */
export function renderRequirement(pkg: string, version: string, indent = '  - '): string {
  return `${indent}"${pkg}/${version}"`;
}

/**
 * Add or update a requirement (upsert by package name, case-insensitive).
 * Returns the new text plus whether an existing line was replaced.
 */
export function upsertRequirement(text: string, pkg: string, version: string): { text: string; replaced: boolean } {
  const lines = text.split(/\r?\n/);
  let replaced = false;
  let requirementsSeen = false;
  let lastRequirementIndex = -1;
  const want = pkg.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^requirements:\s*$/.test(trimmed)) {
      requirementsSeen = true;
      continue;
    }
    if (!requirementsSeen) {
      continue;
    }
    const m = REQUIREMENT_RE.exec(trimmed);
    if (m) {
      lastRequirementIndex = i;
      if (m[2].toLowerCase() === want) {
        lines[i] = renderRequirement(pkg, version);
        replaced = true;
      }
    } else if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      break;
    }
  }

  if (!replaced) {
    const insertAt = lastRequirementIndex >= 0 ? lastRequirementIndex + 1 : text.split(/\r?\n/).length;
    lines.splice(insertAt, 0, renderRequirement(pkg, version));
  }
  return { text: lines.join('\n'), replaced };
}

/** Remove a requirement by package name (case-insensitive). */
export function removeRequirement(text: string, pkg: string): { text: string; removed: boolean } {
  const want = pkg.toLowerCase();
  const lines: string[] = [];
  let removed = false;
  for (const raw of text.split(/\r?\n/)) {
    const m = REQUIREMENT_RE.exec(raw.trim());
    if (m && m[2].toLowerCase() === want) {
      removed = true;
      continue;
    }
    lines.push(raw);
  }
  return { text: lines.join('\n'), removed };
}
