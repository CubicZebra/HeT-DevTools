/**
 * HeT status-bar chip (GUI rework v3 — V3-1/V3-3).
 *
 * PURE monitoring surface — it never offers "new project". The chip appears
 * ONLY when an fcpp project is detected (invisible otherwise), sits bottom-
 * right (host places it beside the notification bell), shows a theme-icon
 * tooltip on hover, and opens a QuickPick overview on click.
 * PURE module — no VS Code imports (unit-testable).
 */

export interface ChipTest {
  passed: number;
  failed: number;
  skipped: number;
}

export interface ChipModel {
  /** '' when no fcpp project is open. */
  projectName: string;
  health: number | null;
  running: string | null;
  lastBuildOk: boolean | null;
  test: ChipTest | null;
  templateBehind: number;
  /** Sniffed conan runtime description (e.g. 'conda env build' / 'PATH' / null). */
  conanEnv: string | null;
}

export interface ChipSpec {
  text: string;
  /** Markdown with `$(codicon)` theme icons (host wraps in MarkdownString). */
  tooltip: string;
  /** Command run on click (monitor overview QuickPick). */
  command?: string;
  /** VS Code ThemeColor id, e.g. statusBarItem.errorBackground. */
  color?: string;
}

/** Render the chip only while a project is open — monitoring only. */
export function chipSpec(m: ChipModel): ChipSpec | null {
  if (!m.projectName) {
    return null;
  }
  const run = m.running ? '$(sync~spin)' : '$(pulse)';
  const score = m.health === null ? '·' : String(m.health);
  const text = `${run} HeT ${score}`;
  const healthIcon = m.health === null ? '$(question)' : m.health >= 80 ? '$(smiley)' : m.health >= 50 ? '$(warning)' : '$(error)';
  const buildIcon = m.lastBuildOk === null ? '$(circle-outline)' : m.lastBuildOk ? '$(pass)' : '$(error)';
  const testIcon = m.test ? (m.test.failed > 0 ? '$(error)' : '$(pass)') : '$(circle-outline)';
  const tplIcon = m.templateBehind > 0 ? '$(sync~spin)' : '$(check)';
  const conanIcon = m.conanEnv ? '$(check)' : '$(error)';
  const runningLine = m.running ? `\n- $(sync~spin) 运行中：${m.running}` : '';
  const lines = [
    `**$(package) HeT DevTools — ${m.projectName}**`,
    `- ${healthIcon} 健康分 ${m.health === null ? '未体检' : `${m.health}/100`}`,
    `- ${buildIcon} 最近构建 ${m.lastBuildOk === null ? '未运行' : m.lastBuildOk ? '成功' : '失败'}`,
    m.test
      ? `- ${testIcon} 测试 ${m.test.passed}/${m.test.passed + m.test.failed + m.test.skipped} 通过 · 失败 ${m.test.failed} · 跳过 ${m.test.skipped}`
      : '- $(circle-outline) 测试 未运行',
    `- ${tplIcon} ${m.templateBehind > 0 ? `模板可更新 ${m.templateBehind} 个提交` : '模板与参考一致'}`,
    `- ${conanIcon} conan ${m.conanEnv ?? '未找到（构建暂不可用）'}`,
    runningLine,
    '',
    '点击 chip 打开监控概况（键盘可直达各分区）',
  ].filter((l) => l.length > 0);
  return {
    text,
    tooltip: lines.join('\n'),
    command: 'het.chipOverview',
    color: m.lastBuildOk === false ? 'statusBarItem.errorBackground' : undefined,
  };
}
