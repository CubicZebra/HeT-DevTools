/**
 * HeT status-bar chip (GUI rework — V5-2 "hover console").
 *
 * PURE module (no VS Code imports). The chip appears ONLY while an fcpp
 * project is open. V5-2 turns the hover into an interactive "small console":
 * a 项目/状态 table whose rows carry `command:` links (Copilot-style: hover
 * persists, click executes, the host refreshes the model afterwards).
 * Clicking the chip itself still opens the Level-2 HUD.
 *
 * Row order & labels are locked by the V5 plan (all four chars, health last):
 *   🔧 开发环境 · 🏗️ 构建结果 · 🍺 测试中心 · 📚 技术文档 · 📊 代码覆盖
 *   · 📖 模板同步 · 💚 工程健康 (total row, LAST)
 */

export interface ChipTest {
  passed: number;
  failed: number;
  skipped: number;
}

export type DocsRowState = 'none' | 'running' | 'ok' | 'fail';

export interface ChipModel {
  /** '' when no fcpp project is open. */
  projectName: string;
  health: number | null;
  running: string | null;
  lastBuildOk: boolean | null;
  test: ChipTest | null;
  templateBehind: number;
  /** Sniffed conan runtime description (legacy; superseded by envSummary). */
  conanEnv: string | null;
  /** V4-6 rich rows (optional). */
  buildAgo?: string | null;
  buildType?: string | null;
  coverage?: number | null;
  runtimeDetail?: string | null;
  /** V5-2: 开发环境 row — single env sample line (envSample.summary). */
  envSummary?: string | null;
  /** V5-2: 技术文档 row outcome. */
  docs?: DocsRowState | null;
  docsDoxygen?: boolean;
  docsSphinx?: boolean;
  /** V5-2: 代码覆盖 row — metadata switch state. */
  coverageEnabled?: boolean | null;
  /** V5-2: 💚 工程健康 row (score + verdict + ≤3 short gaps). */
  healthVerdict?: string | null;
  healthGaps?: string[] | null;
}

export interface ChipSpec {
  text: string;
  /** Markdown with `$(codicon)` + `command:` links (host wraps & trusts). */
  tooltip: string;
  command?: string;
  color?: string;
}

/** Visual glyphs (pure-visual never collide with fcpp trigger semantics). */
const G_BUILD = '🏗️';
const G_TEST = '🍺';
const G_DOCS = '📚';
const G_COV = '📊';
const G_TPL = '📖';
const G_ENV = '🔧';
const G_HEALTH = '💚';

/** Markdown `command:` link (optional URL-encoded JSON arg). */
export function cmdLink(label: string, command: string, arg?: string): string {
  const target = arg === undefined ? `command:${command}` : `command:${command}?${encodeURIComponent(JSON.stringify(arg))}`;
  return `[${label}](${target})`;
}

function envCell(m: ChipModel): string {
  const summary = (m.envSummary ?? '').trim();
  const base = summary.length > 0 ? summary : '未检测';
  return `${base} · ${cmdLink('检查', 'het.envCheck')}`;
}

function buildCell(m: ChipModel): string {
  const ok = m.lastBuildOk;
  const ago = ok && m.buildAgo ? ` · ${m.buildAgo}` : '';
  const type = ok && m.buildType ? ` · ${m.buildType}` : '';
  if (ok === null) {
    return `未运行 · ${cmdLink('构建并测试', 'het.test')}`;
  }
  const head = ok ? `✅ 成功${type}${ago}` : '❌ 失败';
  const extra = ok ? '' : ` · ${cmdLink('输出', 'het.openBuildOutput')}`;
  return `${head}${extra} · ${cmdLink('构建并测试', 'het.test')}`;
}

function testCell(m: ChipModel): string {
  const t = m.test;
  if (!t) {
    return '未运行';
  }
  const ok = t.failed === 0;
  const line = `${ok ? '✅' : '❌'} 通过 ${t.passed} · 失败 ${t.failed} · 跳过 ${t.skipped}`;
  return ok ? line : `${line} · ${cmdLink('查看测试结果', 'het.showTestResults')}`;
}

function docsCell(m: ChipModel): string {
  const state = m.docs ?? 'none';
  if (state === 'running') {
    return '$(sync~spin) 构建中';
  }
  if (state === 'ok') {
    const links: string[] = [];
    if (m.docsDoxygen) {
      links.push(cmdLink('Doxygen', 'het.openDocsArtifact', 'doxygen'));
    }
    if (m.docsSphinx) {
      links.push(cmdLink('Sphinx', 'het.openDocsArtifact', 'sphinx'));
    }
    return links.length ? `✅ 成功 · ${links.join(' ')}` : '✅ 成功（产物未找到）';
  }
  if (state === 'fail') {
    return `❌ 失败 · ${cmdLink('查看详情', 'het.docs')}`;
  }
  return `未构建 · ${cmdLink('构建文档', 'het.docs')}`;
}

function coverageCell(m: ChipModel): string {
  const pct = m.coverage === null || m.coverage === undefined ? '' : `行 ${m.coverage}%`;
  const switchTxt = m.coverageEnabled === false ? '未开启' : pct || '未生成';
  const lead = pct && m.coverageEnabled === false ? `${pct}（开关关）` : switchTxt;
  return `${lead} · ${cmdLink('生成覆盖率', 'het.coverage')}`;
}

function templateCell(m: ChipModel): string {
  return m.templateBehind > 0 ? `可更新 ${m.templateBehind} 个提交` : '与参考一致';
}

function healthCell(m: ChipModel): string {
  const base = m.health === null ? '未体检' : `${m.health}/100 · ${m.healthVerdict ?? '—'}`;
  const gaps = (m.healthGaps ?? []).slice(0, 3);
  const gapTxt = gaps.length ? ` · 可提升：${gaps.join('、')}` : '';
  const detail = gaps.length ? ` · ${cmdLink('查看详情', 'het.healthReport')}` : '';
  return `${base}${gapTxt} · ${cmdLink('重新体检', 'het.healthCheck')}${detail}`;
}

/** Render the chip only while a project is open — monitoring only. */
export function chipSpec(m: ChipModel): ChipSpec | null {
  if (!m.projectName) {
    return null;
  }
  const run = m.running && m.running !== 'env' ? '$(sync~spin)' : '$(pulse)';
  const score = m.health === null ? '·' : String(m.health);
  const text = `${run} HeT ${score}`;

  const healthIcon = m.health === null ? '$(question)' : m.health >= 80 ? '$(smiley)' : m.health >= 50 ? '$(warning)' : '$(error)';
  const healthTxt = m.health === null ? '未体检' : `${m.health}/100`;
  const buildIcon = m.lastBuildOk === null ? '$(circle-outline)' : m.lastBuildOk ? '$(pass)' : '$(error)';
  const buildTxt = m.lastBuildOk === null ? '未运行' : m.lastBuildOk ? '成功' : '失败';
  const testIcon = m.test ? (m.test.failed > 0 ? '$(error)' : '$(pass)') : '$(circle-outline)';
  const testTxt = m.test ? `${m.test.passed}/${m.test.passed + m.test.failed + m.test.skipped}` : '—';

  const badges = [`${healthIcon} 健康 ${healthTxt}`, `${buildIcon} 构建 ${buildTxt}`, `${testIcon} 测试 ${testTxt}`].join('   ');

  const rows: Array<[string, string]> = [
    [`${G_ENV} 开发环境`, envCell(m)],
    [`${G_BUILD} 构建结果`, buildCell(m)],
    [`${G_TEST} 测试中心`, testCell(m)],
    [`${G_DOCS} 技术文档`, docsCell(m)],
    [`${G_COV} 代码覆盖`, coverageCell(m)],
    [`${G_TPL} 模板同步`, templateCell(m)],
    [`${G_HEALTH} 工程健康`, healthCell(m)],
  ];

  const table = ['| 项目 | 状态 |', '| --- | --- |', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
  const runningLine = m.running && m.running !== 'env' ? `\n\n$(sync~spin) 运行中：${m.running}` : '';

  const tooltip = [
    `**$(package) HeT DevTools · ${m.projectName}**`,
    '',
    badges,
    '',
    table,
    runningLine,
    '',
    '$(keyboard) Enter 打开完整监控卡 · 悬停操作点击即执行 · $(eye) 可隐藏监控 chip',
  ].join('\n');

  return {
    text,
    tooltip,
    command: 'het.chipOverview',
    color: m.lastBuildOk === false ? 'statusBarItem.errorBackground' : undefined,
  };
}
