import * as assert from 'node:assert';
import { PAGES, isCockpitPage, pageDef } from '../features/cockpit/layout';
import { CockpitState, initialCockpitState, reduceCockpit } from '../features/cockpit/state';
import { buildCockpitHtml, buildPageContentHtml, renderCockpitRegions } from '../features/cockpit/webview/render';

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
  it('log:done stops running, records result and collapses the drawer', () => {
    let s = reduceCockpit(s0, { type: 'log:start', title: 'x' });
    s = reduceCockpit(s, { type: 'log:done', ok: true });
    assert.strictEqual(s.top.running, null);
    assert.strictEqual(s.lastBuildOk, true);
    assert.strictEqual(s.drawer.expanded, false);
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
    const html = buildPageContentHtml('deps', undefined);
    assert.ok(html.includes('P-G2 将在此接入「依赖」'));
  });
});
