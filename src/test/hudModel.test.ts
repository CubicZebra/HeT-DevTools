import * as assert from 'node:assert';
import {
  HudModel,
  defaultHudActions,
  hudEnabled,
  hudHtml,
} from '../features/hud/hudModel';

function model(over: Partial<HudModel> = {}): HudModel {
  return {
    title: 'mylib2',
    health: 92,
    running: null,
    lastBuildOk: true,
    test: { passed: 7, failed: 0, skipped: 1 },
    coverage: 87,
    buildAgo: '3 分钟前',
    provider: { label: 'Windows · WSL2 托管 distro（gcc + lcov 全语义）', coverage: 'full' },
    runtime: 'conan 2.32 · conda env build（启发式推断 · 极可能）',
    env: [
      { label: 'conan', value: '2.32', tone: 'ok' },
      { label: 'gtest', value: 'conan 托管（构建时获取）', tone: 'ok' },
      { label: 'lcov', value: '可选', tone: 'plain' },
    ],
    actions: defaultHudActions(),
    templateBehind: 0,
    ...over,
  };
}

describe('V4-6 hudModel (Level-2 HUD card)', () => {
  it('default actions: ten entries, first nine carry 1..9 digits', () => {
    const a = defaultHudActions();
    assert.strictEqual(a.length, 10);
    for (let i = 0; i < 9; i++) {
      assert.strictEqual(a[i].digit, i + 1, `action ${i} must be digit ${i + 1}`);
    }
    assert.strictEqual(a[9].digit, undefined, '10th action is click-only');
    // fcpp-native trigger glyphs on the CI-semantic actions
    const byCmd = new Map(a.map((x) => [x.cmd, x.icon]));
    assert.strictEqual(byCmd.get('het.test'), '🍺');
    assert.strictEqual(byCmd.get('het.build'), '🏗️');
    assert.strictEqual(byCmd.get('het.docs'), '📖');
    assert.strictEqual(byCmd.get('het.quality'), '🛡️');
    assert.strictEqual(byCmd.get('het.release'), '📦');
  });

  it('renders stat cards, provider line, env rows and digit hint', () => {
    const html = hudHtml(model(), 14);
    assert.ok(html.includes('mylib2'));
    assert.ok(html.includes('92/100'), 'health stat');
    assert.ok(html.includes('7/8'), 'test stat');
    assert.ok(html.includes('87%'), 'coverage badge');
    assert.ok(html.includes('WSL2'), 'provider line');
    assert.ok(html.includes('conan 托管'), 'env row value');
    assert.ok(html.includes('<kbd>1</kbd>'), 'digit hint');
    assert.ok(html.includes("vscode.postMessage({ type: 'close' })"), 'Esc wiring');
  });

  it('font-size setting is honoured (clamped 10..20)', () => {
    const small = hudHtml(model(), 6);
    assert.ok(small.includes('font-size: 10px'));
    const large = hudHtml(model(), 999);
    assert.ok(large.includes('font-size: 20px'));
    const mid = hudHtml(model(), 14.5);
    assert.ok(mid.includes('font-size: 14.5px'));
  });

  it('env tones map to ok/warn/fail classes', () => {
    const html = hudHtml(
      model({
        env: [
          { label: 'conan', value: 'ok', tone: 'ok' },
          { label: 'x', value: 'warn', tone: 'warn' },
          { label: 'y', value: 'fail', tone: 'fail' },
        ],
      }),
      13,
    );
    assert.ok(html.includes('class="dot ok"'));
    assert.ok(html.includes('class="dot warn"'));
    assert.ok(html.includes('class="dot fail"'));
  });

  it('hudEnabled: only an explicit true disables the HUD', () => {
    assert.strictEqual(hudEnabled(undefined), true);
    assert.strictEqual(hudEnabled(false), true);
    assert.strictEqual(hudEnabled(true), false);
  });
});
