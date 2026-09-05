/**
 * HeT status-bar chip (GUI rework v3 — V3-1/V3-3; V4-6 hover engineering).
 *
 * PURE monitoring surface — it never offers "new project". The chip appears
 * ONLY when an fcpp project is detected (invisible otherwise), sits bottom-
 * right (host places it beside the notification bell).
 * V4-6: the hover is an engineered Markdown overview (codicons + fcpp-native
 * gitmoji semantics); clicking opens the Level-2 HUD card (host decides).
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
  /** V4-6 rich rows (optional — absent rows are omitted). */
  buildAgo?: string | null;
  buildType?: string | null;
  coverage?: number | null;
  /** e.g. 'conan 2.32 · conda env build · 启发式推断·极可能' */
  runtimeDetail?: string | null;
}

export interface ChipSpec {
  text: string;
  /** Markdown with `$(codicon)` theme icons (host wraps in MarkdownString). */
  tooltip: string;
  /** Command run on click (V4-6: opens the HUD card / falls back to QuickPick). */
  command?: string;
  /** VS Code ThemeColor id, e.g. statusBarItem.errorBackground. */
  color?: string;
}

/**
 * V4-6 gitmoji semantics (visual parity with the fcpp trigger table):
 *  build 🏗️ · tests 🍺 · docs/template 📖 · release 📦 · security 🛡️ · board 🔥.
 *  Pure-visual rows keep codicons ($(gear) env, 📊 coverage) so trigger emoji
 *  never collide with non-CI meaning.
 */
const G_BUILD = '🏗️';
const G_TEST = '🍺';
const G_DOCS = '📖';

/** Render the chip only while a project is open — monitoring only. */
export function chipSpec(m: ChipModel): ChipSpec | null {
  if (!m.projectName) {
    return null;
  }
  const run = m.running ? '$(sync~spin)' : '$(pulse)';
  const score = m.health === null ? '·' : String(m.health);
  const text = `${run} HeT ${score}`;

  const healthIcon = m.health === null ? '$(question)' : m.health >= 80 ? '$(smiley)' : m.health >= 50 ? '$(warning)' : '$(error)';
  const healthTxt = m.health === null ? '未体检' : `${m.health}/100`;
  const buildIcon = m.lastBuildOk === null ? '$(circle-outline)' : m.lastBuildOk ? '$(pass)' : '$(error)';
  const buildTxt = m.lastBuildOk === null ? '未运行' : m.lastBuildOk ? '成功' : '失败';
  const testIcon = m.test ? (m.test.failed > 0 ? '$(error)' : '$(pass)') : '$(circle-outline)';
  const tplTxt = m.templateBehind > 0 ? `可更新 ${m.templateBehind} 个提交` : '与参考一致';

  // ---- compact status strip (codicons only, no emoji pile) ----
  const badges = [
    `${healthIcon} 健康 ${healthTxt}`,
    `${buildIcon} 构建 ${buildTxt}`,
    `${testIcon} 测试 ${m.test ? `${m.test.passed}/${m.test.passed + m.test.failed + m.test.skipped}` : '—'}`,
  ].join('   ');

  // ---- two-column table: label glyph + value (markdown-native, engineered) ----
  const rows: { k: string; v: string }[] = [];
  const buildAgo = m.lastBuildOk === null || !m.buildAgo ? '' : ` · ${m.buildAgo}`;
  const buildType = m.lastBuildOk === null || !m.buildType ? '' : ` · ${m.buildType}`;
  rows.push({ k: `${G_BUILD} 构建`, v: `${m.lastBuildOk === null ? '未运行' : m.lastBuildOk ? '成功' : '失败'}${buildType}${buildAgo}`.trim() });
  rows.push({ k: `${G_TEST} 测试`, v: m.test ? `通过 ${m.test.passed} · 失败 ${m.test.failed} · 跳过 ${m.test.skipped}` : '未运行' });
  if (m.coverage !== null && m.coverage !== undefined) {
    rows.push({ k: '📊 覆盖率', v: `${m.coverage}%` });
  }
  const runtime = m.runtimeDetail && m.runtimeDetail.length > 0 ? m.runtimeDetail : m.conanEnv ?? '未找到（构建暂不可用）';
  rows.push({ k: '⚙️ 运行时', v: runtime });
  rows.push({ k: `${G_DOCS} 模板`, v: tplTxt });

  const table = [
    '| 指标 | 值 |',
    '| --- | --- |',
    ...rows.map((r) => `| ${r.k} | ${r.v} |`),
  ].join('\n');
  const runningLine = m.running ? `\n\n$(sync~spin) 运行中：${m.running}` : '';

  const tooltip = [
    `**$(package) HeT DevTools · ${m.projectName}**`,
    '',
    badges,
    '',
    table,
    runningLine,
    '',
    '$(keyboard) Enter 打开监控卡 · $(eye) 可隐藏监控 chip',
  ].join('\n');

  return {
    text,
    tooltip,
    command: 'het.chipOverview',
    color: m.lastBuildOk === false ? 'statusBarItem.errorBackground' : undefined,
  };
}
