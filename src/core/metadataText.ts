/**
 * V5-3 metadata.json human-readable writers — pure (no vscode).
 *
 * fcpp metadata.json is pure JSON (no comments) with a hand-tuned compact
 * style: 2-space indent, scalar arrays inline (`"authors": ["a <b@c>"]`) and
 * single-key objects with a scalar-array value inline
 * (`"dependencies": {"common": {"ZLIB": ["ZLIB::ZLIB"]}}`). Machine rewrites
 * with `JSON.stringify(x, null, 2)` inflate every array/object into many
 * lines — noisy diffs and unreadable to humans.
 *
 * - `fcppStyleStringify` re-serializes a parsed object in that exact style.
 * - `surgicalPatch` rewrites only the affected TOP-LEVEL fields on the
 *   original text (every other byte is preserved); when a field cannot be
 *   located it falls back to a whole-document rewrite with
 *   `fcppStyleStringify`.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

const pad = (depth: number): string => '  '.repeat(depth);

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function isScalarArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => isScalar(x));
}

/** A zero/one-key object whose value is a scalar or a scalar array → inline. */
function isInlineableObject(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const keys = Object.keys(v);
  if (keys.length === 0) {
    return true;
  }
  return keys.length === 1 && (isScalar((v as Record<string, unknown>)[keys[0]]) || isScalarArray((v as Record<string, unknown>)[keys[0]]));
}

/** Single-line JSON rendering for scalars / scalar arrays / inlineable objects. */
function inlineValue(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return v.length === 0 ? '[]' : `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
  }
  const keys = Object.keys(v);
  if (keys.length === 0) {
    return '{}';
  }
  const inner = (v as Record<string, unknown>)[keys[0]];
  return `{"${keys[0]}": ${Array.isArray(inner) ? (inner.length ? `[${inner.map((x) => JSON.stringify(x)).join(', ')}]` : '[]') : JSON.stringify(inner)}}`;
}

/**
 * Emit a value as fcpp-style LINES. The first returned line has NO indent
 * (the caller adds its own key/indent); deeper lines are already indented at
 * `depth` (the indent level of the value's children).
 */
function emitLines(v: JsonValue, depth: number): string[] {
  if (isScalar(v) || isScalarArray(v) || isInlineableObject(v)) {
    return [inlineValue(v)];
  }
  if (Array.isArray(v)) {
    if (v.length === 0) {
      return ['[]'];
    }
    const lines = ['['];
    v.forEach((item, i) => {
      const sub = emitLines(item as JsonValue, depth + 1);
      lines.push(`${pad(depth + 1)}${sub[0]}${i < v.length - 1 ? ',' : ''}`);
      for (let j = 1; j < sub.length; j++) {
        lines.push(sub[j]);
      }
    });
    lines.push(`${pad(depth)}]`);
    return lines;
  }
  const obj = v as Record<string, JsonValue>;
  const keys = Object.keys(obj);
  const lines: string[] = ['{'];
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    const sub = emitLines(obj[k], depth + 1);
    if (sub.length === 1) {
      lines.push(`${pad(depth + 1)}"${k}": ${sub[0]}${comma}`);
      return;
    }
    lines.push(`${pad(depth + 1)}"${k}": ${sub[0]}`);
    for (let j = 1; j < sub.length; j++) {
      lines.push(sub[j]);
    }
    lines[lines.length - 1] += comma;
  });
  lines.push(`${pad(depth)}}`);
  return lines;
}

/** Serialize a parsed object/array (root) in fcpp style; no trailing newline. */
export function fcppStyleStringify(value: unknown): string {
  return emitLines(value as JsonValue, 0).join('\n');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `body` is a complete single-line JSON value. */
function isSelfContainedInline(body: string): boolean {
  const t = body.trim();
  if (/^"(?:\\.|[^"\\])*"$/u.test(t) || /^(?:true|false|null|-?\d+(?:\.\d+)?)$/u.test(t)) {
    return true;
  }
  if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
    if (t.includes('\n')) {
      return false;
    }
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Replace an existing single-line top-level field, preserving comma/indent. */
function replaceInlineField(text: string, key: string, value: JsonValue): string | null {
  const re = new RegExp(`^([ \\t]*)"${escapeRegExp(key)}"[ \\t]*:[ \\t]*(.*?)[ \\t]*(,?)[ \\t]*$`, 'u');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m || !isSelfContainedInline(m[2])) {
      continue;
    }
    const comma = lines[i].trimEnd().endsWith(',') ? ',' : '';
    lines[i] = `${m[1]}"${key}": ${inlineValue(value)}${comma}`;
    return lines.join('\n');
  }
  return null;
}

/** Replace an existing multi-line object field by brace matching. */
function replaceObjectField(text: string, key: string, value: JsonValue): string | null {
  const lines = text.split('\n');
  const startRe = new RegExp(`^([ \\t]*)"${escapeRegExp(key)}"[ \\t]*:[ \\t]*\\{$`, 'u');
  for (let i = 0; i < lines.length; i++) {
    const m = startRe.exec(lines[i]);
    if (!m) {
      continue;
    }
    const indent = m[1];
    let depth = 0;
    let end = -1;
    for (let j = i; j < lines.length; j++) {
      const stripped = lines[j].replace(/"(?:\\.|[^"\\])*"/gu, '""');
      for (const ch of stripped) {
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        }
      }
      if (depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) {
      return null;
    }
    const hadComma = lines[end].trimEnd().endsWith(',');
    const body = fcppStyleStringify(value).split('\n'); // starts '{', ends '}'
    const out: string[] = [];
    out.push(`${indent}"${key}": ${body[0]}`);
    for (let j = 1; j < body.length - 1; j++) {
      out.push(`${indent}${body[j]}`);
    }
    out.push(`${indent}${body[body.length - 1]}${hadComma ? ',' : ''}`);
    return [...lines.slice(0, i), ...out, ...lines.slice(end + 1)].join('\n');
  }
  return null;
}

/** Insert a missing top-level field before `dependencies`, else before close. */
function insertTopLevelField(text: string, key: string, value: JsonValue): string | null {
  const lines = text.split('\n');
  if (lines.length > 1) {
    const indent = '  ';
    const anchorRe = /^ {2}"(?:dependencies|workflow_triggers)"/u;
    for (let i = 0; i < lines.length; i++) {
      if (anchorRe.test(lines[i])) {
        return [...lines.slice(0, i), `${indent}"${key}": ${inlineValue(value)},`, ...lines.slice(i)].join('\n');
      }
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\}[ \t]*$/u.test(lines[i])) {
        return [...lines.slice(0, i), `${indent}"${key}": ${inlineValue(value)}`, ...lines.slice(i)].join('\n');
      }
    }
  }
  return null;
}

export interface PatchOutcome {
  text: string;
  /** 'surgical' when only affected fields changed; 'rewrite' on fallback. */
  method: 'surgical' | 'rewrite';
}

/**
 * Apply a top-level patch to the ORIGINAL metadata text, preserving every
 * byte outside the patched fields. Falls back to a whole-document rewrite
 * (fcpp style) when a field cannot be located (e.g. single-line JSON).
 */
export function surgicalPatch(original: string, patch: Record<string, unknown>): PatchOutcome {
  let text = original;
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw as JsonValue;
    const isObjectValue = !!value && typeof value === 'object' && !Array.isArray(value);
    let next: string | null = null;
    if (isObjectValue) {
      next = replaceObjectField(text, key, value);
      if (next === null) {
        next = replaceInlineField(text, key, value);
      }
    } else {
      next = replaceInlineField(text, key, value);
    }
    if (next !== null) {
      text = next;
      continue;
    }
    const inserted = insertTopLevelField(text, key, value);
    if (inserted !== null) {
      text = inserted;
      continue;
    }
    // Could not patch surgically (single-line doc) → full fcpp-style rewrite.
    try {
      const merged = { ...(JSON.parse(original) as Record<string, unknown>), ...patch };
      return { text: fcppStyleStringify(merged as JsonValue), method: 'rewrite' };
    } catch {
      return { text, method: 'surgical' };
    }
  }
  return { text, method: 'surgical' };
}
