import { defaultValue, paramKind } from './testgen';

/**
 * Test generation Mode B — blueprint-driven / test-first (T-2.8 / G-09 Mode B).
 * Pure logic, no VS Code imports.
 *
 * From a development blueprint (PRD text, structured spec, or a PlantUML
 * class diagram) it extracts the input→output contract of the target module,
 * renders a GTest *contract* file (expected to fail until implemented) and an
 * implementation-plan Markdown document (written under <root>/workspace/).
 *
 * Guardrail (het-testgen): Mode B never writes implementation files on its
 * own — it produces the plan and test contract; implementation is confirmed
 * separately.
 */

export interface ContractFn {
  /** Suite for TEST() — module or PlantUML class name. */
  suite: string;
  name: string;
  /** Parameter type strings as written in the blueprint. */
  paramTypes: string[];
  /** Raw return type text, '' when unspecified. */
  returns: string;
  /** Source line (1-based) where the signature was found. */
  line: number;
}

export interface BlueprintParse {
  ok: boolean;
  issues: string[];
  contracts: ContractFn[];
}

const FN_RE =
  /^\s*(?:[-*]\s*)?(?:API|func|fn|function|接口)\s+([A-Za-z_]\w*)\s*\(\s*([^)]*)\)\s*(?:->|=>|:)\s*(.+?)\s*$/;
const UML_CLASS_RE = /^\s*(?:class|interface)\s+([A-Za-z_]\w*)\s*\{?\s*$/;

function splitParams(inner: string): string[] {
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
  return out.filter((p) => p.length > 0 && p !== 'void');
}

/** Keep only the type part of a "type name" parameter token. */
function typeOnly(p: string): string {
  const t = p
    .replace(/\b(?:const|volatile)\s+/g, '')
    .replace(/=[^=]+$/, '')
    .trim();
  const m = t.match(/^(.+?)\s+[A-Za-z_]\w*$/);
  return (m ? m[1] : t).trim();
}

export function parseBlueprint(text: string): BlueprintParse {
  const issues: string[] = [];
  const contracts: ContractFn[] = [];
  const lines = text.split(/\r?\n/);

  let umlSuite = '';
  const openUmlClass = (name: string | undefined): void => {
    if (!name) {
      umlSuite = '';
      return;
    }
    umlSuite = name;
    if (!text.includes(`class ${name}`) && !text.includes(`interface ${name}`)) {
      // tolerate slightly relaxed syntax by just trusting the regex hit
    }
  };

  let i = 0;
  for (const raw of lines) {
    i++;
    const line = raw.replace(/\/\/.*$/, '').trim();

    const cls = UML_CLASS_RE.exec(line);
    if (cls) {
      openUmlClass(cls[1]);
      continue;
    }
    if (line === '}' || /^\s*}\s*$/.test(raw)) {
      umlSuite = '';
      continue;
    }

    const m = FN_RE.exec(line);
    if (m) {
      contracts.push({
        suite: umlSuite || 'Blueprint',
        name: m[1],
        paramTypes: splitParams(m[2]).map(typeOnly),
        returns: m[3].replace(/;+$/, '').trim(),
        line: i,
      });
      continue;
    }
    // PlantUML method: '+ <ret> name(params)' — name is the identifier before '('
    if (line.startsWith('+') && umlSuite) {
      const openIdx = line.indexOf('(');
      if (openIdx > 1) {
        const head = line.slice(1, openIdx);
        const nm = head.match(/([A-Za-z_]\w*)\s*$/);
        if (nm) {
          const ret = head.slice(0, head.length - nm[0].length).trim();
          contracts.push({
            suite: umlSuite,
            name: nm[1],
            paramTypes: splitParams(line.slice(openIdx + 1, line.lastIndexOf(')'))).map(typeOnly),
            returns: ret,
            line: i,
          });
          continue;
        }
      }
    }
  }

  if (contracts.length === 0) {
    issues.push(
      '未识别到任何契约函数。请使用以下任一写法：\n' +
        '  1) 函数式：func <name>(<type> <name>, ...) -> <returnType>\n' +
        '  2) PlantUML 类：class MyMod {  + <ret> <name>(<params>) }\n' +
        '  3) 列表：- API <name>(<params>) -> <returnType>',
    );
  }
  return { ok: contracts.length > 0, issues, contracts };
}

/**
 * Render the GTest contract file (Mode B). References <module>.hpp so the file
 * intentionally does not compile until the module is implemented (test-first).
 */
export function renderContractTest(
  moduleName: string,
  contracts: ContractFn[],
  extraNotes: string[],
): string {
  const suite = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  const cases: string[] = [];

  const emit = (title: string, body: string[]): void => {
    cases.push(`TEST(${suite}, ${title}) {\n${body.map((l) => `    ${l}`).join('\n')}\n}`);
  };

  for (const fn of contracts) {
    const kinds = fn.paramTypes.map(paramKind);
    const callable = kinds.every((k) => k !== 'unknown');
    const args = kinds.map((k) => defaultValue(k));
    const call = `${fn.name}(${args.join(', ')})`;

    if (fn.paramTypes.length === 0 || callable) {
      emit(`${fn.name}_positive_contract`, [
        '// Mode B contract (test-first): define expected behavior here.',
        `ASSERT_NO_THROW(${call});`,
      ]);
    } else {
      emit(`${fn.name}_positive_contract`, [
        '// TODO: refine params below once the signature is confirmed.',
        `GTEST_SKIP() << "params need manual types: ${fn.paramTypes.join(', ')}";`,
        `(void)${fn.name};`,
      ]);
    }

    if (callable && fn.paramTypes.length === 1) {
      const k = kinds[0];
      const edge =
        k === 'int'
          ? '-1 /* boundary: negative */'
          : k === 'uint'
            ? '0u /* boundary: zero */'
            : k === 'pointer' || k === 'cstring'
              ? 'nullptr'
              : defaultValue(k);
      emit(`${fn.name}_boundary_contract`, [
        '// TODO: fill boundary expectations from the PRD.',
        `ASSERT_NO_THROW(${fn.name}(${edge}));`,
      ]);
    }
  }

  const notes = extraNotes.filter((n) => n.trim().length > 0);
  const noteBlock = notes.map((n) => `// ${n}`).join('\n');

  return [
    `#include <gtest/gtest.h>`,
    `#include <${moduleName}.hpp> // NOTE: create this header per the implementation plan (test-first).`,
    ``,
    `// Generated by HeT DevTools (testgen Mode B / G-09).`,
    `// Test-first contract: expect compile/fail until the module is implemented.`,
    ...(notes.length > 0 ? ['', noteBlock] : []),
    ``,
    cases.join('\n\n\n'),
    ``,
  ].join('\n');
}

/** Render the implementation-plan Markdown document (written to /workspace/). */
export function renderImplementationPlan(
  moduleName: string,
  moduleDir: string,
  contracts: ContractFn[],
  blueprintTitle: string,
): string {
  const headerLines = contracts
    .map(
      (fn) =>
        `- \`${fn.name}(${fn.paramTypes.join(', ')})${fn.returns ? ` -> ${fn.returns}` : ''}\` (from ${fn.suite} @L${fn.line})`,
    )
    .join('\n');
  const decls = contracts
    .map((fn) => {
      const params = fn.paramTypes
        .map((t, idx) => `${t} arg${idx}`)
        .join(', ');
      return `    ${fn.returns || 'void'} ${fn.name}(${params});`;
    })
    .join('\n');

  return `# ${moduleName} — 蓝图实现计划（test-first）

> 生成：HeT DevTools · testgen Mode B（G-09）· 蓝图：「${blueprintTitle}」
> 契约测试文件：\`test_package/test/unit/${moduleName}_contract_test.cpp\`（先写测试，实现后转绿）

## 1. 从蓝图中提取的契约

${headerLines}

## 2. 待新增文件

| 文件 | 用途 |
|------|------|
| \`${moduleDir}/include/${moduleName}.hpp\` | 公开声明（含 \`// Conan::ImportStart/End\`、\`#pragma once\`、双语 \`@brief\`、\`@since\`、\`@exporter\`） |
| \`${moduleDir}/src/${moduleName}.cpp\` | 实现（配对文件，两空行分隔全局对象） |
| \`test_package/test/unit/${moduleName}_contract_test.cpp\` | GTest 契约（由测试生成 Mode B 写入） |

## 3. 建议的公开签名（供头文件使用）

\`\`\`cpp
// include/${moduleName}.hpp
#pragma once

${decls}
\`\`\`

## 4. 实施步骤（Agentic Coding）

1. 新建模块文件：\`include/${moduleName}.hpp\` + \`src/${moduleName}.cpp\`（用「新增模块」向导 G-08 生成骨架）。
2. 按上面签名填入声明与实现，并在头文件 doc 块保留 \`@exporter\`。
3. 实现以「契约测试转绿」为完成标准：\`TEST(…_positive_contract)\` 与 \`TEST(…_boundary_contract)\` 通过。
4. 打开覆盖率（G-06）确认新模块行覆盖达标后再提交。

## 5. 契约明细

| 函数 | 参数 | 返回 | 蓝图行 | 来源 |
|------|------|------|--------|------|
${contracts
  .map(
    (fn) =>
      `| \`${fn.name}\` | ${fn.paramTypes.join(', ') || '—'} | ${fn.returns || '—'} | ${fn.line} | ${fn.suite} |`,
  )
  .join('\n')}
`;
}
