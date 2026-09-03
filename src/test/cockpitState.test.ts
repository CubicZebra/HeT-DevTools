import * as assert from 'node:assert';
import { PAGES, isCockpitPage, pageDef } from '../features/cockpit/layout';
import { CockpitState, initialCockpitState, reduceCockpit } from '../features/cockpit/state';
import { buildCockpitHtml, buildPageContentHtml, renderCockpitRegions, renderWizardRegion } from '../features/cockpit/webview/render';

const s0 = initialCockpitState();

describe('cockpit.layout', () => {
  it('has 11 unique pages, all with icon + label', () => {
    assert.strictEqual(PAGES.length, 11);
    assert.strictEqual(new Set(PAGES.map((p) => p.id)).size, 11);
    for (const p of PAGES) {
      assert.ok(p.icon.length > 0);
      assert.ok(p.label.length > 0);
    }
  });
  it('validates page ids', () => {
    assert.ok(isCockpitPage('overview'));
    assert.ok(!isCockpitPage('nope'));
    assert.strictEqual(pageDef('deps').icon, 'package');
    assert.strictEqual(pageDef('nope' as never), PAGES[0]);
  });
});

describe('cockpit.state', () => {
  it('starts on overview with collapsed empty drawer', () => {
    assert.strictEqual(s0.page, 'overview');
    assert.strictEqual(s0.drawer.expanded, false);
    assert.strictEqual(s0.drawer.kind, 'none');
    assert.strictEqual(s0.top.running, null);
  });
  it('navigate switches the current page', () => {
    const s = reduceCockpit(s0, { type: 'navigate', page: 'quality' });
    assert.strictEqual(s.page, 'quality');
  });
  it('drawer:toggle expands/collapses', () => {
    const on = reduceCockpit(s0, { type: 'drawer:toggle', expand: true });
    assert.strictEqual(on.drawer.expanded, true);
    assert.strictEqual(reduceCockpit(on, { type: 'drawer:toggle', expand: false }).drawer.expanded, false);
  });
  it('log:start opens the log drawer and records the running title', () => {
    const s = reduceCockpit(s0, { type: 'log:start', title: 'conan create (Debug)' });
    assert.strictEqual(s.drawer.kind, 'log');
    assert.strictEqual(s.drawer.expanded, true);
    assert.deepStrictEqual(s.drawer.lines, []);
    assert.strictEqual(s.top.running, 'conan create (Debug)');
  });
  it('log:append caps lines at 200 and ignores when drawer is not log', () => {
    let s = reduceCockpit(s0, { type: 'log:start', title: 'x' });
    for (let i = 0; i < 205; i++) {
      s = reduceCockpit(s, { type: 'log:append', line: `line-${i}` });
    }
    assert.strictEqual(s.drawer.lines.length, 200);
    assert.strictEqual(s.drawer.lines[0], 'line-5');
    assert.strictEqual(s.drawer.lines[199], 'line-204');
    const ignored = reduceCockpit(s0, { type: 'log:append', line: 'stray' });
    assert.deepStrictEqual(ignored.drawer.lines, []);
  });
  it('log:done stops running and records the result, keeping the drawer open for auto-collapse', () => {
    let s = reduceCockpit(s0, { type: 'log:start', title: 'x' });
    s = reduceCockpit(s, { type: 'log:done', ok: true });
    assert.strictEqual(s.top.running, null);
    assert.strictEqual(s.lastBuildOk, true);
    assert.strictEqual(s.drawer.kind, 'log');
    assert.strictEqual(s.drawer.expanded, true);
    const closed = reduceCockpit(s, { type: 'drawer:toggle', expand: false });
    assert.strictEqual(closed.drawer.expanded, false);
  });
  it('issue:summary >0 opens the issues drawer; 0 closes it', () => {
    const s = reduceCockpit(s0, { type: 'issue:summary', count: 3 });
    assert.strictEqual(s.issueCount, 3);
    assert.strictEqual(s.drawer.kind, 'issues');
    assert.strictEqual(s.drawer.expanded, true);
    const back = reduceCockpit(s, { type: 'issue:summary', count: 0 });
    assert.strictEqual(back.drawer.expanded, false);
  });
  it('template/health/project events update the top strip', () => {
    let s = reduceCockpit(s0, { type: 'project', name: 'mylib' });
    s = reduceCockpit(s, { type: 'health', score: 87 });
    s = reduceCockpit(s, { type: 'template:update', behind: 2 });
    assert.strictEqual(s.top.projectName, 'mylib');
    assert.strictEqual(s.top.health, 87);
    assert.strictEqual(s.top.templateBehind, 2);
  });
  it('wizard: open → step through → close', () => {
    let s = reduceCockpit(s0, { type: 'wizard:open' });
    assert.deepStrictEqual(s.wizard, { step: 1 });
    s = reduceCockpit(s, { type: 'wizard:step', step: 2 });
    assert.strictEqual(s.wizard?.step, 2);
    s = reduceCockpit(s, { type: 'wizard:step', step: 5, error: 'x' });
    assert.strictEqual(s.wizard?.step, 5);
    assert.strictEqual(s.wizard?.error, 'x');
    s = reduceCockpit(s, { type: 'wizard:close' });
    assert.strictEqual(s.wizard, null);
  });
});

describe('cockpit.render', () => {
  const state: CockpitState = {
    ...s0,
    page: 'deps',
    top: { ...s0.top, projectName: 'mylib', health: 90, templateBehind: 1 },
  };
  it('renders rail with codicon icons and active page', () => {
    const html = buildCockpitHtml(state, { codiconCss: 'vscode://x/codicon.css' });
    assert.ok(html.includes('codicon-package'));
    assert.ok(html.includes('data-page="deps"'));
    assert.ok(html.includes('rail-item active'));
    assert.ok(html.includes('codicon-home'));
  });
  it('renders primary action buttons only on overview', () => {
    assert.ok(buildCockpitHtml(s0, { codiconCss: '' }).includes('data-cmd="het.build"'));
    const deps = buildCockpitHtml({ ...s0, page: 'deps' }, { codiconCss: '' });
    assert.ok(!deps.includes('data-cmd="het.build"'));
  });
  it('renders expanded log drawer with escaped lines', () => {
    const s = reduceCockpit(reduceCockpit(s0, { type: 'log:start', title: 'build' }), { type: 'log:append', line: '<script>alert(1)</script>' });
    const regions = renderCockpitRegions(s);
    assert.ok(regions.drawer.includes('&lt;script&gt;'));
    assert.ok(regions.drawer.includes('build'));
    const collapsed = renderCockpitRegions(s0);
    assert.ok(collapsed.drawer.includes('日志 · 问题 · 向导'));
  });

  it('renders overview page content with health, tools and primary actions', () => {
    const html = buildPageContentHtml('overview', {
      projectName: 'mylib',
      healthScore: 91,
      tools: [
        { name: 'conan', ok: true },
        { name: 'doxygen', ok: false },
      ],
      lastBuildOk: true,
      lastTest: { passed: 7, failed: 0, skipped: 1 },
    });
    assert.ok(html.includes('健康分 91'));
    assert.ok(html.includes('✓ conan'));
    assert.ok(html.includes('✗ doxygen'));
    assert.ok(html.includes('data-cmd="het.test"'));
    assert.ok(html.includes('codicon-play'));
  });

  it('renders build-test page content with results line', () => {
    const html = buildPageContentHtml('buildTest', {
      lastBuildOk: false,
      lastTest: { passed: 3, failed: 2, skipped: 0 },
    });
    assert.ok(html.includes('失败 2'));
    assert.ok(html.includes('data-cmd="het.build"'));
    assert.ok(html.includes('codicon-beaker'));
  });

  it('renders placeholder for pages without adapters yet', () => {
    const html = buildPageContentHtml('commit', undefined);
    assert.ok(html.includes('P-G2 将在此接入「提交」'));
  });

  it('renders summary pages: text rows without icons, primary buttons with icons', () => {
    const html = buildPageContentHtml('release', {
      rows: [
        ['release 开关', '✓ 已开启'],
        ['build_type', 'Release'],
      ],
      actions: [{ cmd: 'het.release', icon: 'rocket', label: '发布中心' }],
    });
    assert.ok(html.includes('release 开关'));
    assert.ok(html.includes('✓ 已开启'));
    assert.ok(html.includes('data-cmd="het.release"'));
    assert.ok(html.includes('codicon-rocket'));
    // sub-rows carry no icon markup
    assert.ok(!/codicon/.test(html.split('data-cmd="het.release"')[0].split('release 开关')[1] ?? ''));
  });

  it('renders the deps deep form: grouped rows, remove actions and an add form', () => {
    const html = buildPageContentHtml('deps', {
      items: [
        { bucket: 'common', displayKey: 'ZLIB', conanName: 'zlib', version: '1.3.1', targets: ['etl', 'net'] },
        { bucket: 'cpp', displayKey: 'Eigen3', conanName: 'eigen', targets: [] },
      ],
      issues: [],
    });
    assert.ok(html.includes('公共 (common)'));
    assert.ok(html.includes('<b>ZLIB</b>'));
    assert.ok(html.includes('zlib@1.3.1'));
    assert.ok(html.includes('data-page-action="deps:remove"'));
    assert.ok(html.includes('data-arg-bucket="common"'));
    assert.ok(html.includes('data-arg-key="ZLIB"'));
    assert.ok(html.includes('data-action="deps:add"'));
    assert.ok(html.includes('name="conanName"'));
    assert.ok(html.includes('codicon-add'));
  });

  it('renders the bench page: platform row, paste form and parse result table', () => {
    const html = buildPageContentHtml('bench', {
      platform: 'Cortex-M 裸机',
      parsed: { complete: true, cases: [['matmul_4x4', '12345']] },
    });
    assert.ok(html.includes('Cortex-M 裸机'));
    assert.ok(html.includes('data-action="bench:parse"'));
    assert.ok(html.includes('name="text"'));
    assert.ok(html.includes('matmul_4x4'));
    assert.ok(html.includes('12345'));
    assert.ok(html.includes('✓ 协议完整'));
  });

  it('renders the five-step wizard overlay with steps, forms and finish summary', () => {
    const info = {
      templateRepo: 'https://github.com/HeT-FTI/fcpp',
      templateRef: 'abc123',
      modeLabel: '本地副本：C:/tpl',
      parentDir: 'C:/ws',
    };
    const w1 = renderWizardRegion({ step: 1 }, info, {});
    assert.ok(w1.includes('新项目向导'));
    assert.ok(w1.includes('模板仓库'));
    assert.ok(w1.includes('HeT-FTI/fcpp'));
    assert.ok(w1.includes('data-wizard="next"'));
    assert.ok(!w1.includes('data-wizard="prev"'));
    const w2 = renderWizardRegion({ step: 2 }, info, { name: 'mylib' });
    assert.ok(w2.includes('data-wizard="submit"'));
    assert.ok(w2.includes('value="mylib"'));
    const w5 = renderWizardRegion({ step: 5, error: 'boom' }, info, { name: 'mylib', buildType: 'Release', cppstd: '20' });
    assert.ok(w5.includes('C:/ws/mylib'));
    assert.ok(w5.includes('data-wizard="finish"'));
    assert.ok(w5.includes('boom'));
    const none = renderWizardRegion(null, info, {});
    assert.strictEqual(none, '');
  });
});
