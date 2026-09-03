/**
 * HeT status-bar chip (GUI rework v2 — V2-1).
 *
 * The ONLY always-visible surface of the extension. Invisible by default:
 *  - no fcpp project + non-empty workspace  → chip hidden (VS Code unchanged)
 *  - fcpp project open                       → one small chip with health pulse
 *  - empty workspace folder                  → "＋ 新建 fcpp 项目" hint (one-time
 *                                             notification handled by the host)
 *
 * The tooltip is a markdown bullet overview with command links so a hover is
 * enough to read the whole project health and jump to actions.
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
  /** True only when an actual empty workspace folder is open. */
  workspaceEmpty: boolean;
  health: number | null;
  running: string | null;
  lastBuildOk: boolean | null;
  test: ChipTest | null;
  templateBehind: number;
}

export interface ChipSpec {
  text: string;
  tooltip: string;
  command?: string;
  /** VS Code ThemeColor id, e.g. statusBarItem.errorBackground. */
  color?: string;
}

/** command:foo?["a",1] — args array must be URI-encoded JSON. */
function link(label: string, command: string, args?: unknown[]): string {
  const suffix = args && args.length ? `?${encodeURIComponent(JSON.stringify(args))}` : '';
  return `[${label}](command:${command}${suffix})`;
}

export function chipSpec(m: ChipModel): ChipSpec | null {
  if (m.projectName) {
    const run = m.running ? '$(sync~spin)' : '$(pulse)';
    const score = m.health === null ? '·' : String(m.health);
    const text = `${run} HeT ${score}`;
    const testLine = m.test
      ? `- 测试 ${m.test.passed}/${m.test.passed + m.test.failed + m.test.skipped} 通过 · 失败 ${m.test.failed} · 跳过 ${m.test.skipped} · ${link('查看结果', 'het.showTestResults')}`
      : '- 测试 未运行';
    const buildLine = `- 最近构建 ${
      m.lastBuildOk === null
        ? '未运行'
        : m.lastBuildOk
          ? '✓ 成功'
          : `✗ 失败 · ${link('查看问题', 'workbench.actions.view.problems')}`
    } · ${link('重跑', 'het.build')}`;
    const templateLine =
      m.templateBehind > 0
        ? `- ⚠ 模板可更新 ${m.templateBehind} 个提交 · ${link('查看同步计划', 'het.templateUpdate')}`
        : '- 模板与参考一致';
    const healthLine = `- 健康分 ${m.health === null ? '未体检' : `${m.health}/100`} · ${link('一键体检', 'het.healthCheck')}`;
    const runningLine = m.running ? `- 运行中：${m.running}` : '';
    const actionLine = `${link('打开仪表盘', 'het.dashboard')} · ${link('构建并测试', 'het.test')} · ${link('新建项目', 'het.newProject')}`;
    const lines = [
      `**HeT DevTools — ${m.projectName}**`,
      healthLine,
      buildLine,
      testLine,
      templateLine,
      runningLine,
      `---`,
      actionLine,
    ].filter((l) => l.length > 0);
    return {
      text,
      tooltip: lines.join('\n\n'),
      command: 'het.dashboard',
      color: m.lastBuildOk === false ? 'statusBarItem.errorBackground' : undefined,
    };
  }

  if (m.workspaceEmpty) {
    return {
      text: '$(rocket) HeT ＋ 新建 fcpp 项目',
      tooltip:
        '**HeT DevTools**\n\n当前文件夹为空。可基于 fcpp 模板初始化一个标准 C/C++ 库工程（构建 / 测试 / 文档 / 发布流水线开箱即用）：\n\n' +
        link('新建项目（向导）', 'het.newProject'),
      command: 'het.newProject',
    };
  }

  // Non-fcpp, non-empty workspace → completely invisible.
  return null;
}
