import * as assert from 'node:assert';
import {
  MANAGED_DISTRO,
  decodeWslOutput,
  parseWslList,
  parseWslToolReport,
  toWslPath,
  wslRunArgs,
} from '../core/wslHost';

describe('V4-3 wslHost (WSL2 lane pure helpers)', () => {
  it('maps Windows drive paths to /mnt/<drive> (forward+back slashes, spaces)', () => {
    assert.strictEqual(toWslPath('C:\\Users\\Chen'), '/mnt/c/Users/Chen');
    assert.strictEqual(toWslPath('C:/a b/c'), '/mnt/c/a b/c');
    assert.strictEqual(toWslPath('D:\\'), '/mnt/d');
    assert.strictEqual(toWslPath('E:/x'), '/mnt/e/x');
  });

  it('leaves already-WSL paths untouched', () => {
    assert.strictEqual(toWslPath('/mnt/c/x'), '/mnt/c/x');
    assert.strictEqual(toWslPath('/root'), '/root');
  });

  it('parses wsl -l -q output (CRLF, default marker, header noise)', () => {
    const out = 'Ubuntu-24.04 (default)\r\nhet-fcpp\r\n\r\n';
    const names = parseWslList(out);
    assert.deepStrictEqual(names, ['Ubuntu-24.04', 'het-fcpp']);
    assert.deepStrictEqual(parseWslList('Windows Subsystem for Linux Distributions:\r\nUbuntu\r\n'), ['Ubuntu']);
    assert.deepStrictEqual(parseWslList(''), []);
    assert.deepStrictEqual(parseWslList('--version'), []);
  });

  it('builds wsl.exe args with optional --cd', () => {
    assert.deepStrictEqual(wslRunArgs('Ubuntu', 'bash', ['-lc', 'echo hi']), ['-d', 'Ubuntu', '--', 'bash', '-lc', 'echo hi']);
    assert.deepStrictEqual(wslRunArgs('het-fcpp', 'make', ['-j2'], '/mnt/c/proj'), ['-d', 'het-fcpp', '--cd', '/mnt/c/proj', '--', 'make', '-j2']);
  });

  it('parses the deterministic tool probe report (dash = missing)', () => {
    const snap = parseWslToolReport('gcc:13.3.0\ncmake:-\nconan:2.32.0\nlcov:2.0-1\n');
    assert.strictEqual(snap.gcc, '13.3.0');
    assert.strictEqual(snap.conan, '2.32.0');
    assert.strictEqual(snap.lcov, '2.0-1');
    assert.strictEqual(snap.cmake, undefined, 'dash means missing → omitted');
  });

  it('exposes the managed distro name', () => {
    assert.strictEqual(MANAGED_DISTRO, 'het-fcpp');
  });

  it('decodes wsl.exe UTF-16LE output (NUL pairs, optional BOM)', () => {
    // No BOM: every ASCII char is followed by a NUL byte (utf8-decoded).
    assert.strictEqual(
      decodeWslOutput('U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000-\u00002\u00004\u0000.\u00000\u00004\u0000\r\u0000\n\u0000'),
      'Ubuntu-24.04\r\n',
    );
    // BOM (0xFF 0xFE) becomes two replacement chars before the text.
    assert.strictEqual(decodeWslOutput('\uFFFD\uFFFDU\u0000b\u0000'), 'Ub');
    // Plain utf8 passes through untouched.
    assert.strictEqual(decodeWslOutput('plain text'), 'plain text');
  });
});
