import { readText } from '../utils/fs';

/**
 * Test generation Mode A (code-driven) — development-plan T-2.5 / G-09.
 * Scans the public API surface of an fcpp module header and produces a
 * GTest skeleton at test_package/test/unit/<module>_test.cpp.
 * Only ever *adds* test files; never touches include/ or src/.
 * Pure helpers are VS Code-free; the fs wrapper lives in planModuleTests.
 */

export interface ApiFunction {
  name: string;
  signature: string;
  /** Top-level parameter type strings, e.g. ["int", "const int*"]. */
  paramTypes: string[];
  /** True when the header block carried the fcpp `@exporter` marker. */
  exporter: boolean;
}

export type ParamKind = 'int' | 'uint' | 'float' | 'double' | 'bool' | 'pointer' | 'cstring' | 'unknown';

const INT_RE = /^(?:unsigned\s+)?(?:int|char|short|long|long\s+long|size_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t)$/;
const UINT_RE = /^(?:unsigned|uint8_t|uint16_t|uint32_t|uint64_t|size_t)$/;
const FLOAT_RE = /^float$/;
const DOUBLE_RE = /^double$/;
const BOOL_RE = /^bool$/;

export function paramKind(raw: string): ParamKind {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.endsWith('*') && /char/.test(t)) {
    return 'cstring';
  }
  if (t.endsWith('*')) {
    return 'pointer';
  }
  if (INT_RE.test(t)) {
    return UINT_RE.test(t) ? 'uint' : 'int';
  }
  if (FLOAT_RE.test(t)) {
    return 'float';
  }
  if (DOUBLE_RE.test(t)) {
    return 'double';
  }
  if (BOOL_RE.test(t)) {
    return 'bool';
  }
  return 'unknown';
}

/** Default value literal for a param kind (compiles under GTest). */
export function defaultValue(kind: ParamKind): string {
  switch (kind) {
    case 'int':
      return '0';
    case 'uint':
      return '0u';
    case 'float':
      return '0.0f';
    case 'double':
      return '0.0';
    case 'bool':
      return 'false';
    case 'pointer':
    case 'cstring':
      return 'nullptr';
    default:
      return '';
  }
}

/**
 * Extract doc-comment blocks ("/** ... *\/") that carry @exporter (or any doc
 * block) and the code declaration that follows them.
 */
export function scanDocBlocks(content: string): { doc: string; code: string }[] {
  const blocks: { doc: string; code: string }[] = [];
  const re = /\/\*\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const doc = m[0];
    const rest = content.slice(m.index + m[0].length);
    const upTo = rest.match(/^(?:\s|\r|\n)*([^;{}]*(?:[;{}]))/);
    let code = '';
    if (upTo) {
      code = upTo[1].trim();
    }
    blocks.push({ doc, code });
  }
  return blocks;
}

function splitTopLevelParams(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(' || ch === '<' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
    } else if (ch === ')' || ch === '>' || ch === ']' || ch === '}') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  const last = cur.trim();
  if (last.length > 0) {
    out.push(last);
  }
  return out;
}

/** Parse one code slice (declaration ending in ';') into an ApiFunction. */
export function parseDeclaration(code: string): ApiFunction | null {
  if (!code.endsWith(';') || code.includes('=') || code.includes('typedef')) {
    return null;
  }
  const open = code.indexOf('(');
  if (open === -1) {
    return null;
  }
  // function name = last identifier before '('
  const head = code.slice(0, open);
  const nameMatch = head.match(/([A-Za-z_]\w*)\s*$/);
  if (!nameMatch) {
    return null;
  }
  const name = nameMatch[1];
  const close = code.lastIndexOf(')');
  const inner = code.slice(open + 1, close);
  const params = splitTopLevelParams(inner);
  const paramTypes = params
    .map((p) => p.replace(/\b(?:const)\s+/g, '').replace(/=[^=]+$/, '').trim())
    .filter((p) => p.length > 0 && p !== 'void')
    .map((p) => {
      // strip a trailing parameter name to recover the type
      const t = p.match(/^(.+?)\s+[A-Za-z_]\w*$/);
      return t ? t[1].trim() : p;
    });
  return { name, signature: code.slice(0, -1).trim(), paramTypes, exporter: true };
}

/** Extract public callables from one header source (only @exporter blocks). */
export function scanHeader(content: string): ApiFunction[] {
  const apis: ApiFunction[] = [];
  for (const { doc, code } of scanDocBlocks(content)) {
    if (!/@exporter/.test(doc)) {
      continue;
    }
    const fn = parseDeclaration(code);
    if (fn) {
      apis.push(fn);
    }
  }
  return apis;
}

/** Render a `<module>_test.cpp` skeleton for the discovered API. */
export function renderTestFile(moduleName: string, headerInclude: string, apis: ApiFunction[]): string {
  const suite = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  const cases: string[] = [];

  const emit = (title: string, body: string[]): void => {
    cases.push(`TEST(${suite}, ${title}) {\n${body.map((l) => `    ${l}`).join('\n')}\n}`);
  };

  for (const api of apis) {
    const kinds = api.paramTypes.map(paramKind);
    const callable = kinds.every((k) => k !== 'unknown');
    const args = kinds.map((k) => defaultValue(k));
    const call = `${api.name}(${args.join(', ')})`;

    // 1. positive
    if (api.paramTypes.length === 0) {
      emit(`${api.name}_positive`, [`ASSERT_NO_THROW(${api.name}());`]);
    } else if (callable) {
      emit(`${api.name}_positive`, [`ASSERT_NO_THROW(${call});`]);
    } else {
      emit(`${api.name}_positive`, [
        '// TODO(het): fill args/expectations then enable the real assertion',
        `GTEST_SKIP() << "params need manual types: ${api.paramTypes.join(', ')}";`,
        `(void)${api.name}; // reference the symbol so it links`,
      ]);
    }

    // 2. boundary (only for known scalar/pointer signatures)
    if (api.paramTypes.length === 0) {
      emit(`${api.name}_boundary_reentrant`, [
        `ASSERT_NO_THROW(${api.name}());`,
        `ASSERT_NO_THROW(${api.name}()); // repeated calls must not crash`,
      ]);
    } else if (callable && api.paramTypes.length === 1) {
      const k = kinds[0];
      const edge =
        k === 'int' ? '-1 /* boundary: negative */' : k === 'uint' ? '0u /* boundary: zero */' : k === 'pointer' || k === 'cstring' ? 'nullptr' : defaultValue(k);
      emit(`${api.name}_boundary`, [
        '// TODO(het): add boundary expectations per the implementation contract',
        `ASSERT_NO_THROW(${api.name}(${edge}));`,
      ]);
    }

    // 3. negative (guarded until semantics are known)
    emit(`${api.name}_negative`, [
      '// TODO(het): assert invalid input is rejected or throws (contract decides)',
      'GTEST_SKIP() << "negative semantics await the implementation contract";',
    ]);
  }

  const sections = cases.join('\n\n\n'); // two blank lines between global objects
  return [
    `#include <gtest/gtest.h>`,
    `#include <${headerInclude}>`,
    ``,
    `// Generated by HeT DevTools (testgen mode A / G-09).`,
    `// You may extend assertions; main.cpp is maintained by the system, do not edit.`,
    ``,
    sections,
    ``,
  ].join('\n');
}

/** Locate a module header under include/ (hpp preferred, then h). */
export function moduleHeaderName(moduleName: string): string {
  return `${moduleName}.hpp`;
}

export interface TestGenResult {
  ok: boolean;
  issues: string[];
  relPath: string;
  content: string;
}

/** Full plan for one module: read header from disk + render test file. */
export async function planModuleTests(root: string, moduleName: string): Promise<TestGenResult> {
  const issues: string[] = [];
  const header = moduleHeaderName(moduleName);
  let content = '';
  try {
    content = await readText(`${root}/include/${header}`);
  } catch {
    issues.push(`include/${header} 不存在`);
  }
  if (issues.length > 0) {
    return { ok: false, issues, relPath: '', content: '' };
  }
  const apis = scanHeader(content);
  if (apis.length === 0) {
    return { ok: false, issues: [`include/${header} 未发现带 @exporter 的公开 API`], relPath: '', content: '' };
  }
  return {
    ok: true,
    issues: [],
    relPath: `test_package/test/unit/${moduleName}_test.cpp`,
    content: renderTestFile(moduleName, header, apis),
  };
}
