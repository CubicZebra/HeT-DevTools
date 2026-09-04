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

describe('statusChip (V3-1/V3-3 monitoring-only chip)', () => {
  it('shows a compact project chip with the health pulse and opens the overview on click', () => {
    const s = chipSpec(projectModel());
    assert.ok(s);
    assert.ok(s!.text.includes('HeT 87'));
    assert.ok(s!.text.includes('$(pulse)'));
    assert.strictEqual(s!.command, 'het.chipOverview');
  });
  it('tooltip is a read-only icon overview with NO command links and NO new-project', () => {
    const s = chipSpec(projectModel())!;
    assert.ok(s.tooltip.includes('健康分 87'));
    assert.ok(s.tooltip.includes('$(smiley)'));
    assert.ok(s.tooltip.includes('$(pass)'));
    assert.ok(!s.tooltip.includes('command:het.'), 'tooltip must not rely on clickable command links');
    assert.ok(!s.tooltip.includes('het.newProject'), 'monitoring chip must not offer new project');
  });
  it('marks a failed build in red with an error icon', () => {
    const s = chipSpec(projectModel({ lastBuildOk: false, test: { passed: 4, failed: 3, skipped: 0 } }))!;
    assert.strictEqual(s.color, 'statusBarItem.errorBackground');
    assert.ok(s.tooltip.includes('$(error)'));
    assert.ok(s.tooltip.includes('失败'));
    assert.ok(s.tooltip.includes('失败 3'));
  });
  it('reports the template-behind state with an icon', () => {
    const s = chipSpec(projectModel({ templateBehind: 2 }))!;
    assert.ok(s.tooltip.includes('模板可更新 2'));
    assert.ok(!chipSpec(projectModel())!.tooltip.includes('模板可更新'));
  });
  it('shows the running marker while a command is in flight', () => {
    const s = chipSpec(projectModel({ running: 'conan create (Debug)' }))!;
    assert.ok(s.text.includes('$(sync~spin)'));
    assert.ok(s.tooltip.includes('conan create (Debug)'));
  });
  it('is invisible without a project (monitoring only — no empty-workspace invite)', () => {
    assert.strictEqual(chipSpec({ projectName: '', health: null, running: null, lastBuildOk: null, test: null, templateBehind: 0, conanEnv: null }), null);
  });
  it('reports the sniffed conan environment, or a warning when missing', () => {
    const s = chipSpec(projectModel())!;
    assert.ok(s.tooltip.includes('conda env build'));
    const missing = chipSpec(projectModel({ conanEnv: null }))!;
    assert.ok(missing.tooltip.includes('未找到'));
  });
});
