import * as assert from 'node:assert';
import { ExecError, quoteShell, run, which } from '../utils/exec';

describe('exec.run', () => {
  it('captures stdout and exit code', async () => {
    const res = await run(process.execPath, ['-e', 'console.log("hello-from-node")']);
    assert.strictEqual(res.code, 0);
    assert.ok(res.stdout.includes('hello-from-node'));
  });

  it('captures stderr', async () => {
    const res = await run(process.execPath, ['-e', 'console.error("oops")']);
    assert.strictEqual(res.code, 0);
    assert.ok(res.stderr.includes('oops'));
  });

  it('reports non-zero exit codes', async () => {
    const res = await run(process.execPath, ['-e', 'process.exit(7)']);
    assert.strictEqual(res.code, 7);
  });

  it('streams stdout via callback before completion', async () => {
    const chunks: string[] = [];
    const res = await run(process.execPath, ['-e', 'console.log("AAA"); console.log("BBB")'], {
      onStdout: (c) => chunks.push(c),
    });
    assert.strictEqual(res.code, 0);
    assert.ok(chunks.join('').includes('AAA'));
    assert.ok(chunks.join('').includes('BBB'));
  });

  it('rejects on unknown executable', async () => {
    await assert.rejects(
      () => run('definitely-not-a-real-command-xyz'),
      (e: unknown) => e instanceof ExecError,
    );
  });

  it('kills the child on timeout', async () => {
    await assert.rejects(
      () => run(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { timeoutMs: 300 }),
      (e: unknown) => e instanceof ExecError && e.message.includes('timed out'),
    );
  });

  it('supports abort signal', async () => {
    const ac = new AbortController();
    const pending = run(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { signal: ac.signal });
    ac.abort();
    await assert.rejects(() => pending, (e: unknown) => e instanceof ExecError);
  });

  it('runs in a given cwd', async () => {
    const cwd = process.cwd();
    const res = await run(process.execPath, ['-e', 'console.log(process.cwd())'], { cwd });
    assert.ok(res.stdout.trim().includes(cwd));
  });
});

describe('exec.which', () => {
  it('finds node on PATH', async () => {
    const found = await which('node');
    assert.ok(found && found.length > 0);
  });

  it('returns null for unknown executables', async () => {
    assert.strictEqual(await which('definitely-not-a-real-command-xyz'), null);
  });
});

describe('exec.quoteShell', () => {
  it('returns a quoted token', () => {
    assert.ok(quoteShell('abc').startsWith('"') || quoteShell('abc').startsWith("'"));
  });

  it('handles embedded double quotes', () => {
    const q = quoteShell('a"b');
    assert.ok(q.includes('b'));
  });
});
