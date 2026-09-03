/**
 * Template init / update helpers (development-plan T-4.6 G-21, T-4.7).
 * Pure logic — no VS Code imports.
 *
 * A freshly-initialized project records which upstream ref it was created from
 * in `.het/template-ref.json`; the update check compares the current template
 * HEAD against it and writes a sync plan (never auto-merges — mirroring
 * fcpp's sync-template.yml semantics).
 */

export interface TemplateRefMarker {
  repo: string;
  ref: string;
  label: string;
  recordedAt: string;
}

export function markerPath(): string {
  return '.het/template-ref.json';
}

export function encodeMarker(input: { repo: string; ref: string; label: string }): string {
  const m: TemplateRefMarker = { repo: input.repo, ref: input.ref, label: input.label, recordedAt: new Date().toISOString() };
  return JSON.stringify(m, null, 2) + '\n';
}

export function parseMarker(text: string): TemplateRefMarker | null {
  try {
    const j = JSON.parse(text) as TemplateRefMarker;
    if (typeof j.repo === 'string' && typeof j.ref === 'string') {
      return j;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse `git log --oneline` output (for the sync plan). */
export function parseCommitList(raw: string): { short: string; subject: string }[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      const sp = l.indexOf(' ');
      return sp === -1 ? { short: l, subject: '' } : { short: l.slice(0, sp), subject: l.slice(sp + 1) };
    });
}

/** Render a template sync-plan Markdown document (written to /workspace/). */
export function renderSyncPlan(input: {
  projectName: string;
  repo: string;
  fromRef: string;
  toRef: string;
  commits: { short: string; subject: string }[];
  localOnly: boolean;
}): string {
  const rows = input.commits.map((c) => `| \`${c.short}\` | ${c.subject} |`).join('\n');
  return `# ${input.projectName} — 模板同步计划

> 生成：HeT DevTools · T-4.7 模板更新检查 · ${new Date().toISOString()}
> 语义与 fcpp \`sync-template.yml\` 一致：**本计划只读对比、绝不自动合入**。

## 1. 模板来源

- 仓库：\`${input.repo}\`（${input.localOnly ? '本地开发副本（离线）' : 'GitHub 上游'}）
- 从 \`${input.fromRef}\` 落后到 \`${input.toRef}\`，落后 ${input.commits.length} 个提交：

| commit | 说明 |
|--------|------|
${rows || '| — | 无 |'}

## 2. 建议操作（人工确认后执行）

1. 评审上述提交是否影响本项目的自定义改动（重点：\`metadata.json\`、\`CMakeLists.txt\`、\`conanfile.py\`）。
2. 有冲突风险时，按模块（docs / .github / cmake / conan）分批同步并跑通 \`conan create\`。
3. 本扩展只在必要时把同步结果写回本计划文档；**不会自动修改项目文件**。
`;
}
