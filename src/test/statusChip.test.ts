import * as assert from 'node:assert';
import { chipSpec, ChipModel } from '../features/statusChip';

const projectModel = (over: Partial<ChipModel> = {}): ChipModel => ({
  projectName: 'mylib',
  health: 87,
  running: null,
  lastBuildOk: true,
  test: { passed: 7, failed: 0, skipped: 1 },
  templateBehind: 0,
  conanEnv: 'conda env build',
  ...over,
});

describe('statusChip V5-2 hover console', () => {
  it('shows a compact project chip that opens the HUD on click', () => {
    const s = chipSpec(projectModel());
    assert.ok(s);
    assert.ok(s!.text.includes('HeT 87'));
    assert.strictEqual(s!.command, 'het.chipOverview');
  });

  it('renders the 项目/状态 table with all seven four-char rows (health last)', () => {
    const s = chipSpec(projectModel())!;
    assert.ok(s.tooltip.includes('| 项目 | 状态 |'));
    const labels = ['🔧 开发环境', '🏗️ 构建结果', '🍺 测试中心', '📚 技术文档', '📊 代码覆盖', '📖 模板同步', '💚 工程健康'];
    let lastIndex = -1;
    for (const label of labels) {
      const at = s.tooltip.indexOf(label);
      assert.ok(at > -1, `row ${label} present`);
      assert.ok(at > lastIndex, `row order: ${label} after previous`);
      lastIndex = at;
    }
  });

  it('carries Copilot-style command links (click executes), still no new-project', () => {
    const s = chipSpec(projectModel())!;
    assert.ok(s.tooltip.includes('command:het.test'), 'build row action');
    assert.ok(s.tooltip.includes('command:het.envCheck'), 'env row action');
    assert.ok(s.tooltip.includes('command:het.docs'), 'docs row action');
    assert.ok(s.tooltip.includes('command:het.healthCheck'), 'health row rescore');
    assert.ok(!s.tooltip.includes('het.newProject'));
    // theme icons remain for the verify harness + real rendering
    assert.ok(s.tooltip.includes('$('));
  });

  it('开发环境 row shows the env sample summary', () => {
    const s = chipSpec(projectModel({ envSummary: 'WSL2 · Ubuntu-24.04 · conan Conan version 2.32.0' }))!;
    assert.ok(s.tooltip.includes('WSL2 · Ubuntu-24.04'));
  });

  it('技术文档 row: none → 构建文档 · ok → Doxygen/Sphinx links · fail → 查看详情', () => {
    const none = chipSpec(projectModel())!;
    assert.ok(none.tooltip.includes('未构建'));
    const ok = chipSpec(projectModel({ docs: 'ok', docsDoxygen: true, docsSphinx: true }))!;
    assert.ok(ok.tooltip.includes('command:het.openDocsArtifact?%22doxygen%22'));
    assert.ok(ok.tooltip.includes('command:het.openDocsArtifact?%22sphinx%22'));
    const fail = chipSpec(projectModel({ docs: 'fail' }))!;
    assert.ok(fail.tooltip.includes('❌ 失败'));
    assert.ok(fail.tooltip.includes('command:het.docs'));
  });

  it('构建结果/测试中心 close the loop: failure offers jump links', () => {
    const fail = chipSpec(projectModel({ lastBuildOk: false, test: { passed: 4, failed: 3, skipped: 0 } }))!;
    assert.strictEqual(fail.color, 'statusBarItem.errorBackground');
    assert.ok(fail.tooltip.includes('❌ 失败'));
    assert.ok(fail.tooltip.includes('command:het.openBuildOutput'));
    assert.ok(fail.tooltip.includes('command:het.showTestResults'));
    const ok = chipSpec(projectModel({ lastBuildOk: true }))!;
    assert.ok(!ok.tooltip.includes('command:het.openBuildOutput'));
  });

  it('💚 工程健康 (last row) stays minimal; gap labels live below the table', () => {
    const good = chipSpec(projectModel({ healthVerdict: '良好', healthGaps: [] }))!;
    assert.ok(good.tooltip.includes('87/100 · 良好'));
    assert.ok(!good.tooltip.includes('het.healthReport'));
    assert.ok(!good.tooltip.includes('可提升'));
    const weak = chipSpec(projectModel({ health: 62, healthVerdict: '需改进', healthGaps: ['尚未构建', '覆盖率未开'] }))!;
    assert.ok(weak.tooltip.includes('62/100 · 需改进 · 2项'), 'row stays minimal with a gap count');
    assert.ok(weak.tooltip.includes('command:het.healthCheck'), '体检 short link');
    assert.ok(weak.tooltip.includes('command:het.healthReport'), '明细 short link when improvable');
    // long labels go to a standalone hint paragraph, NOT inside the table cell
    const healthRow = weak.tooltip.split('\n').find((l) => l.includes('💚 工程健康')) ?? '';
    assert.ok(!healthRow.includes('尚未构建'), 'gap labels must not break the table cell');
    assert.ok(weak.tooltip.includes('可提升：尚未构建 · 覆盖率未开'));
  });

  it('模板同步 row reports behind state with fcpp-native 📖 glyph', () => {
    assert.ok(chipSpec(projectModel({ templateBehind: 2 }))!.tooltip.includes('可更新 2 个提交'));
    assert.ok(!chipSpec(projectModel())!.tooltip.includes('可更新'));
    assert.ok(chipSpec(projectModel())!.tooltip.includes('与参考一致'));
  });

  it('shows the running marker while a command is in flight', () => {
    const s = chipSpec(projectModel({ running: 'conan create (Debug)' }))!;
    assert.ok(s.text.includes('$(sync~spin)'));
    assert.ok(s.tooltip.includes('conan create (Debug)'));
  });

  it('is invisible without a project (monitoring only)', () => {
    assert.strictEqual(chipSpec({ projectName: '', health: null, running: null, lastBuildOk: null, test: null, templateBehind: 0, conanEnv: null }), null);
  });
});
