import * as assert from 'node:assert';
import {
  MANAGED_DISTRO,
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
});
