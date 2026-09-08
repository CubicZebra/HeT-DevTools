import * as assert from 'node:assert';
import { envLinuxHtml, envOsxHtml, envTopHtml, envWslHtml } from '../features/cockpit/webview/render';

describe('V4-5 envTopHtml (dashboard env & managed block)', () => {
  it('renders nothing when both plan and managed are absent', () => {
    assert.strictEqual(envTopHtml(null, null), '');
    assert.strictEqual(envTopHtml(undefined, undefined), '');
  });

  it('provider decision line: coverage mark + label + reason', () => {
    const html = envTopHtml({ label: 'Windows · 需要启用 WSL2（或设 toolchain=system 用本机 MSVC）', coverage: 'none', reason: '无 WSL2，需启用或走本机兼容' }, null);
    assert.ok(html.includes('✗'), 'none coverage shows a fail mark');
    assert.ok(html.includes('需要启用 WSL2'));
    assert.ok(!html.includes('MinGW'), 'no MinGW degradation wording remains');
    assert.ok(html.includes('说明'));
    assert.ok(html.includes('启发式推断'));
  });

  it('full coverage plan shows a check mark', () => {
    const html = envTopHtml({ label: 'Linux 原生（gcc 自供）', coverage: 'full' }, null);
    assert.ok(html.includes('✓'));
  });

  it('managed absent offers 准备 and no 移除', () => {
    const html = envTopHtml(null, { state: 'absent', tools: {} });
    assert.ok(html.includes('准备托管环境'));
    assert.ok(html.includes('data-page-action="env:prepare"'));
    assert.ok(!html.includes('data-page-action="env:remove"'));
  });

  it('managed ready lists tools and offers 移除 only', () => {
    const html = envTopHtml(null, { state: 'ready', tools: { conan: '2.9.0', cmake: '4.3.1' } });
    assert.ok(html.includes('已就绪'));
    assert.ok(html.includes('conan 2.9.0'));
    assert.ok(html.includes('data-page-action="env:remove"'));
    assert.ok(!html.includes('data-page-action="env:prepare"'));
  });

  it('managed error offers 重试准备 + 移除', () => {
    const html = envTopHtml(null, { state: 'error', tools: {}, note: 'pip 安装失败' });
    assert.ok(html.includes('重试准备'));
    assert.ok(html.includes('data-page-action="env:remove"'));
    assert.ok(html.includes('pip 安装失败'));
  });

  it('escapes unsafe values', () => {
    const html = envTopHtml({ label: '<script>', coverage: 'none' }, { state: 'error', tools: {}, note: '">&' });
    assert.ok(!html.includes('<script>'), 'script tag must be escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'label escaped to entities');
    assert.ok(html.includes('&quot;&gt;&amp;'), 'note escaped to entities');
  });
});

describe('V4-3 envWslHtml (WSL2 lane block)', () => {
  it('renders nothing when the lane is absent', () => {
    assert.strictEqual(envWslHtml(null), '');
    assert.strictEqual(envWslHtml(undefined), '');
  });

  it('ready lane: check mark + distro + tools', () => {
    const html = envWslHtml({ distro: 'Ubuntu-24.04', ready: true, tools: { gcc: '13.3.0', lcov: '2.0' }, note: '复用现有发行版' });
    assert.ok(html.includes('✓'));
    assert.ok(html.includes('WSL2 车道'));
    assert.ok(html.includes('Ubuntu-24.04'));
    assert.ok(html.includes('gcc 13.3.0'));
    assert.ok(html.includes('复用现有发行版'));
  });

  it('unready lane shows a warning mark and honest copy', () => {
    const html = envWslHtml({ ready: false, tools: {} });
    assert.ok(html.includes('!'));
    assert.ok(html.includes('未就绪'));
    assert.ok(html.includes('WSL2 车道'));
  });
});

describe('V4-4 envOsxHtml (macOS lane block)', () => {
  it('renders nothing when the lane is absent', () => {
    assert.strictEqual(envOsxHtml(null), '');
    assert.strictEqual(envOsxHtml(undefined), '');
  });

  it('ready lane: check mark + Apple clang version + python + note', () => {
    const html = envOsxHtml({ clt: true, clangVersion: '16.0.0', python: 'Python 3.12.3', note: 'Apple clang 16.0.0 · …' });
    assert.ok(html.includes('✓'));
    assert.ok(html.includes('macOS 车道'));
    assert.ok(html.includes('Apple clang 16.0.0'));
    assert.ok(html.includes('Python 3.12.3'));
  });

  it('missing CLT shows warning + actionable copy', () => {
    const html = envOsxHtml({ clt: false, note: '未检测到 Xcode Command Line Tools（需 xcode-select --install 一次）。' });
    assert.ok(html.includes('!'));
    assert.ok(html.includes('未检测到 Command Line Tools'));
    assert.ok(html.includes('xcode-select --install'));
  });
});

describe('A3 envLinuxHtml (native-Linux managed lane block)', () => {
  it('renders nothing when the lane is absent', () => {
    assert.strictEqual(envLinuxHtml(null), '');
    assert.strictEqual(envLinuxHtml(undefined), '');
  });

  it('ready lane: check mark + derived path + tools + note', () => {
    const html = envLinuxHtml({
      home: '/home/chen',
      ready: true,
      tools: { gcc: 'gcc-13 (Ubuntu 13.3.0) 13.3.0', lcov: 'lcov: LCOV version 2.0', conan: 'Conan version 2.32.0' },
      note: '托管 lane · /home/chen/.het-fti/managed-env（隔离 venv + CONAN_HOME）',
    });
    assert.ok(html.includes('✓'));
    assert.ok(html.includes('Linux 派生 managed lane'), 'block names derived managed lane');
    assert.ok(html.includes('.het-fti/managed-env'), 'block shows the isolated path');
    assert.ok(html.includes('gcc-13'), 'system gcc-13 shown as a tool');
    assert.ok(html.includes('隔离 venv'));
  });

  it('unready lane shows warning mark + honest copy', () => {
    const html = envLinuxHtml({ home: '/home/chen', ready: false, tools: {}, note: '托管车道 conan/cmake 未就绪（首次「构建并测试」将自动准备）。' });
    assert.ok(html.includes('!'));
    assert.ok(html.includes('未就绪'));
    assert.ok(html.includes('Linux 派生 managed lane'));
    assert.ok(html.includes('自动准备'));
  });

  it('escapes the home path and note', () => {
    const html = envLinuxHtml({ home: '/home/<x>', ready: false, tools: {}, note: '">&' });
    assert.ok(!html.includes('/home/<x>'));
    assert.ok(html.includes('&lt;x&gt;'));
    assert.ok(html.includes('&quot;&gt;&amp;'));
  });
});
