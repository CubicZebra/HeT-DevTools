/**
 * CI status helpers (development-plan T-4.2 / G-19).
 * Pure logic — no VS Code imports. Parses the git remote origin and the local
 * `.github/workflows/*.yml` so the panel stays useful even fully offline.
 */

export interface RepoIdentity {
  owner: string;
  repo: string;
}

/** Parse `git remote get-url origin` → owner/repo (https, ssh, git@). */
export function parseRemoteOrigin(url: string): RepoIdentity | null {
  const u = url.trim();
  const m = u.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (m) {
    return { owner: m[1], repo: m[2] };
  }
  return null;
}

export interface LocalWorkflow {
  file: string;
  name: string;
  on: string[];
}

/**
 * Lightweight YAML reader for workflow files: extracts top-level `name:` and
 * the triggers under `on:` (inline mapping or list form). Enough for the UI.
 */
export function parseWorkflowYaml(fileName: string, text: string): LocalWorkflow {
  const nameMatch = /^name:\s*(.+?)\s*$/m.exec(text);
  const name = nameMatch ? nameMatch[1].trim() : fileName.replace(/\.ya?ml$/i, '');
  const on: string[] = [];
  const lines = text.split(/\r?\n/);
  let inOn = false;
  let sawList = false;
  for (const raw of lines) {
    const line = raw.replace(/\s*#.*$/, '');
    if (/^on:\s*(.*)$/.test(line)) {
      inOn = true;
      sawList = false;
      const inline = /^on:\s*(.+?)\s*$/.exec(line)?.[1]?.trim();
      if (inline && inline !== '') {
        if (inline.startsWith('[')) {
          for (const t of inline.slice(1, -1).split(',')) {
            const v = t.trim().replace(/^['"]|['"]$/g, '');
            if (v) {
              on.push(v);
            }
          }
        } else {
          on.push(inline);
        }
      }
      continue;
    }
    if (inOn) {
      if (/^\S/.test(line)) {
        inOn = false;
        continue;
      }
      const evt = /^\s{2,}([\w-]+):\s*$/.exec(line);
      if (evt) {
        on.push(evt[1]);
        sawList = true;
        continue;
      }
      if (sawList) {
        const item = /^\s{4,}-\s+(.+?)\s*$/.exec(line);
        if (item) {
          const v = item[1].trim().replace(/^['"]|['"]$/g, '');
          if (v) {
            on.push(v);
          }
          continue;
        }
      }
    }
  }
  return { file: fileName, name, on };
}
