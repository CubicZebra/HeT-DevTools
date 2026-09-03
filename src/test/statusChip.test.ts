import * as assert from 'node:assert';
import { chipSpec, ChipModel } from '../features/statusChip';

const projectModel = (over: Partial<ChipModel> = {}): ChipModel => ({
  projectName: 'mylib',
  workspaceEmpty: false,
  health: 87,
  running: null,
  lastBuildOk: true,
  test: { passed: 7, failed: 0, skipped: 1 },
  templateBehind: 0,
  conanEnv: 'conda env build',
  ...over,
});

describe('statusChip (V2-1 invisible chip)', () => {
  it('shows a compact project chip with the health pulse', () => {
    const s = chipSpec(projectModel());
    assert.ok(s);
    assert.ok(s!.text.includes('HeT 87'));
    assert.ok(s!.text.includes('$(pulse)'));
    assert.strictEqual(s!.command, 'het.dashboard');
  });
  it('tooltip lists health, build, test and action links', () => {
    const s = chipSpec(projectModel())!;
    assert.ok(s.tooltip.includes('健康分 87'));
    assert.ok(s.tooltip.includes('het.healthCheck'));
    assert.ok(s.tooltip.includes('het.build'));
    assert.ok(s.tooltip.includes('het.test'));
    assert.ok(s.tooltip.includes('het.dashboard'));
  });
  it('marks a failed last build in red with a problems link', () => {
    const s = chipSpec(projectModel({ lastBuildOk: false, test: { passed: 4, failed: 3, skipped: 0 } }))!;
    assert.strictEqual(s.color, 'statusBarItem.errorBackground');
    assert.ok(s.tooltip.includes('✗ 失败'));
    assert.ok(s.tooltip.includes('workbench.actions.view.problems'));
    assert.ok(s.tooltip.includes('失败 3'));
  });
  it('reports the template-behind badge when ahead is positive', () => {
    const s = chipSpec(projectModel({ templateBehind: 2 }))!;
    assert.ok(s.tooltip.includes('模板可更新 2'));
    assert.ok(s.tooltip.includes('het.templateUpdate'));
    assert.ok(!chipSpec(projectModel())!.tooltip.includes('模板可更新'));
  });
  it('shows the running marker while a command is in flight', () => {
    const s = chipSpec(projectModel({ running: 'conan create (Debug)' }))!;
    assert.ok(s.text.includes('$(sync~spin)'));
    assert.ok(s.tooltip.includes('conan create (Debug)'));
  });
  it('omits test/build lines when nothing has run yet', () => {
    const s = chipSpec(projectModel({ health: null, lastBuildOk: null, test: null }))!;
    assert.ok(s.tooltip.includes('未体检'));
    assert.ok(s.tooltip.includes('未运行'));
  });
  it('invites project creation on an empty workspace', () => {
    const s = chipSpec({ projectName: '', workspaceEmpty: true, health: null, running: null, lastBuildOk: null, test: null, templateBehind: 0, conanEnv: null });
    assert.ok(s);
    assert.ok(s!.text.includes('新建 fcpp'));
    assert.strictEqual(s!.command, 'het.newProject');
  });
  it('is completely invisible for a non-empty non-fcpp workspace', () => {
    const s = chipSpec({ projectName: '', workspaceEmpty: false, health: null, running: null, lastBuildOk: null, test: null, templateBehind: 0, conanEnv: null });
    assert.strictEqual(s, null);
  });
  it('reports the sniffed conan environment, or a warning when missing', () => {
    const s = chipSpec(projectModel())!;
    assert.ok(s.tooltip.includes('conda env build'));
    const missing = chipSpec(projectModel({ conanEnv: null }))!;
    assert.ok(missing.tooltip.includes('未找到 conan'));
  });
});
