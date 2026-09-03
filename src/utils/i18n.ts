/** Minimal zh/en message catalog. Keys are added feature by feature. */

export type Locale = 'zh' | 'en';

export function normalizeLocale(raw: string | undefined): Locale {
  if (raw && raw.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

type Entry = { zh: string; en: string };

const CATALOG: Record<string, Entry> = {
  // --- generic / shared ---
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.confirm': { zh: '确认', en: 'Confirm' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.viewLog': { zh: '查看日志', en: 'View log' },
  'common.advanced': { zh: '高级', en: 'Advanced' },
  'common.openSettings': { zh: '项目设置', en: 'Project settings' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  // --- activation / smoke ---
  'hello.title': { zh: 'HeT DevTools 冒烟测试通过', en: 'HeT DevTools smoke test passed' },
  // --- detection ---
  'detect.notFcpp': {
    zh: '当前文件夹不是 fcpp 项目（缺少 metadata.json）。',
    en: 'This folder is not an fcpp project (missing metadata.json).',
  },
  // --- build (placeholder wording, wired in Phase 1) ---
  'build.success': { zh: '构建成功', en: 'Build succeeded' },
  'build.failed': { zh: '构建失败', en: 'Build failed' },
  // --- status bar / shared notices (wired for runtime locale) ---
  'status.noProject': { zh: 'HeT: 无 fcpp 项目', en: 'HeT: no fcpp project' },
  'status.project': { zh: '{name} v{version} {buildType}', en: '{name} v{version} {buildType}' },
  'notify.noProject': {
    zh: '未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。',
    en: 'No fcpp project detected: open a folder with metadata.json first.',
  },
  'test.done': { zh: '测试完成：通过 {passed} · 失败 {failed} · 跳过 {skipped}', en: 'Tests done: {passed} passed · {failed} failed · {skipped} skipped' },
};

/** Translate a key for a locale; unknown keys fall back to the key itself. */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const entry = CATALOG[key];
  let text: string;
  if (entry) {
    text = entry[locale];
  } else {
    text = key;
  }
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** Short alias of {@link translate}. */
export const t = translate;
