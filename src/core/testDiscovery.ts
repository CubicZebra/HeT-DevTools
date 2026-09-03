/**
 * GTest source discovery (development-plan T-2.6 / G-05).
 * Pure logic — no VS Code imports. Parses TEST(Suite, Case) declarations.
 */

export interface DeclaredTest {
  suite: string;
  name: string;
  line: number;
}

export function parseTestDeclarations(source: string): DeclaredTest[] {
  // Strip comments (preserving newlines so line numbers stay accurate) so
  // commented-out TEST(...) sketches never surface as discoverable tests.
  const cleaned = source
    .replace(/\/\/[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));

  const out: DeclaredTest[] = [];
  const re = /\bTEST\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\)/g;
  let m: RegExpExecArray | null;
  let line = 1;
  let lastIndex = 0;
  while ((m = re.exec(cleaned)) !== null) {
    line += (cleaned.slice(lastIndex, m.index).match(/\n/g) ?? []).length;
    out.push({ suite: m[1], name: m[2], line });
    lastIndex = m.index;
  }
  return out;
}
