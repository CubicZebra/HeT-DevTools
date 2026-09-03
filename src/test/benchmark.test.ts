import * as assert from 'node:assert';
import {
  configPlatform,
  parseBenchmarkProtocol,
  replaceJsoncField,
  jsonValueText,
} from '../core/benchmark';

describe('benchmark.parseBenchmarkProtocol', () => {
  it('parses cases between START and END', () => {
    const out = parseBenchmarkProtocol(
      'UART boot...\nBENCHMARK_START\nRESULT|test_add_n128|80\nRESULT|test_sub_n128|76\nBENCHMARK_END\ndone\n',
    );
    assert.strictEqual(out.complete, true);
    assert.deepStrictEqual(out.cases, [
      { name: 'test_add_n128', value: 80 },
      { name: 'test_sub_n128', value: 76 },
    ]);
  });
  it('ignores RESULT outside the protocol window', () => {
    const out = parseBenchmarkProtocol('RESULT|stray|1\nBENCHMARK_START\nRESULT|ok|2\n');
    assert.strictEqual(out.started, true);
    assert.strictEqual(out.ended, false);
    assert.strictEqual(out.complete, false);
    assert.deepStrictEqual(out.cases, [{ name: 'ok', value: 2 }]);
  });
});

describe('benchmark.configPlatform', () => {
  it('detects M vs A configs', () => {
    assert.strictEqual(configPlatform({ target_mcu: 'cortex-m4f' }), 'm');
    assert.strictEqual(configPlatform({ target_os: 'Linux', target_cpu: 'cortex-a7' }), 'a');
    assert.strictEqual(configPlatform({}), 'unknown');
  });
});

describe('benchmark.replaceJsoncField', () => {
  const sample = `{
  "_comment": "Board config. Do not change per board? edit me.",
  "target_mcu":        "cortex-m0",
  "float_abi":         "soft",
  "extra_cflags":              [],
  "serial_baud":       115200
}`;
  it('replaces values in place preserving other lines/comments', () => {
    const r = replaceJsoncField(sample, 'target_mcu', 'cortex-m4f');
    assert.strictEqual(r.ok, true);
    assert.ok(r.text.includes('"target_mcu":        "cortex-m4f"'), 'keeps indentation/alignment');
    assert.ok(r.text.includes('"_comment": "Board config. Do not change per board? edit me."'), 'comment preserved');
    const b = replaceJsoncField(r.text, 'serial_baud', 921600);
    assert.ok(b.text.includes('"serial_baud":       921600'));
    assert.strictEqual(b.text.split('\n').length, 7, 'line count preserved');
  });
  it('handles arrays and missing keys', () => {
    const r = replaceJsoncField(sample, 'extra_cflags', ['-O2', '-Wall']);
    assert.ok(r.text.includes('"extra_cflags":              ["-O2", "-Wall"]'));
    const miss = replaceJsoncField(sample, 'nope', 1);
    assert.strictEqual(miss.ok, false);
    assert.strictEqual(miss.text, sample);
  });
});

describe('benchmark.jsonValueText', () => {
  it('serializes scalar and array values', () => {
    assert.strictEqual(jsonValueText('cortex-m0'), '"cortex-m0"');
    assert.strictEqual(jsonValueText(115200), '115200');
    assert.deepStrictEqual(jsonValueText(['a', 'b']), '["a", "b"]');
  });
});
