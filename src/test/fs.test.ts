import * as assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, mergeOrdered, readJson, readText, writeJson, writeText } from '../utils/fs';

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'het-fs-'));
}

describe('fs roundtrip', () => {
  it('writeJson / readJson roundtrip data', async () => {
    const dir = makeDir();
    try {
      const f = join(dir, 'metadata.json');
      await writeJson(f, { name: 'fcpp', build_cppstd: '17' });
      const obj = (await readJson(f)) as { name: string };
      assert.strictEqual(obj.name, 'fcpp');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps trailing newline when the original had one', async () => {
    const dir = makeDir();
    try {
      const f = join(dir, 'a.json');
      await writeText(f, '{ "a": 1 }\n');
      await writeJson(f, { a: 2 });
      const text = await readText(f);
      assert.ok(text.endsWith('\n'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a .bak of the previous content on second write', async () => {
    const dir = makeDir();
    try {
      const f = join(dir, 'b.json');
      await writeJson(f, { a: 1 });
      await writeJson(f, { a: 2 });
      assert.ok(await exists(`${f}.bak`));
      const bak = (await readJson(`${f}.bak`)) as { a: number };
      assert.strictEqual(bak.a, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips .bak when backup=false', async () => {
    const dir = makeDir();
    try {
      const f = join(dir, 'c.json');
      await writeJson(f, { a: 1 });
      await writeJson(f, { a: 2 }, { backup: false });
      assert.ok(!(await exists(`${f}.bak`)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('readJson throws JsonError with file path for malformed json', async () => {
    const dir = makeDir();
    try {
      const f = join(dir, 'bad.json');
      await writeText(f, '{ nope');
      await assert.rejects(() => readJson(f), /invalid JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fs.mergeOrdered', () => {
  it('preserves original key order and appends brand-new keys', () => {
    const merged = mergeOrdered<Record<string, unknown>>(
      { name: 'x', version: '1' } as Record<string, unknown>,
      { version: '2', extra: true },
    );
    assert.deepStrictEqual(Object.keys(merged), ['name', 'version', 'extra']);
    assert.strictEqual(merged.version, '2');
    assert.strictEqual(merged.extra, true);
  });

  it('does not reorder existing keys when patched', () => {
    const merged = mergeOrdered(
      { a: 1, b: 2, c: 3, d: 4 },
      { c: 30, b: 20 },
    );
    assert.deepStrictEqual(Object.keys(merged), ['a', 'b', 'c', 'd']);
    assert.strictEqual(merged.b, 20);
    assert.strictEqual(merged.c, 30);
  });
});
