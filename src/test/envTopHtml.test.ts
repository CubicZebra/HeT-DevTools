import * as assert from 'node:assert';
import { envTopHtml } from '../features/cockpit/webview/render';

describe('V4-5 envTopHtml (dashboard env & managed block)', () => {
  it('renders nothing when both plan and managed are absent', () => {
    assert.strictEqual(envTopHtml(null, null), '');
    assert.strictEqual(envTopHtml(undefined, undefined), '');
  });

  it('provider decision line: coverage mark + label + reason', () => {
    const html = envTopHtml({ label: 'Windows · MinGW-w64 自供（可接受降级）', coverage: 'partial', reason: '无 WSL2，MinGW 提供 gcc 构建/测试' }, null);
    assert.ok(html.includes('!'), 'partial coverage shows a warn mark');
    assert.ok(html.includes('MinGW'));
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
