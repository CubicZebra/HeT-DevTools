import * as assert from 'node:assert';
import { fcppStyleStringify, surgicalPatch } from '../core/metadataText';

// Representative fcpp metadata.json text (same shape/style as the template).
const TPL = `{
  "name": "fcpp",
  "target": "auto",
  "version": "0.1.0",
  "team": "HeT-FTI",
  "license": "Apache-2.0",
  "description": "The simple description in meta",
  "authors": ["Chen Zhang <chen2.zhang@szhittech.com>"],
  "maintainers": ["Chen Zhang <chen2.zhang@szhittech.com>"],
  "topics": ["build", "library", "documentation", "test"],
  "url": "https://github.com/HeT-FTI/fcpp.git",
  "homepage": "https://github.com/HeT-FTI",
  "cmake_version": "4.0.1",
  "build_cppstd": "17",
  "build_cstd": "11",
  "build_type": "Debug",
  "activate_code_coverage": true,
  "is_shared": false,
  "is_header": false,
  "generate_modules_inplace": false,
  "std_modules": "iostream",
  "user_modules": "",
  "dependencies": {
    "common": {"ZLIB": ["ZLIB::ZLIB"]},
    "c": {"PCRE2": ["pcre2::pcre2"]},
    "cpp": {
      "Eigen3": ["Eigen3::Eigen"],
      "etl": ["etl::etl"]
    },
    "infra": {"GTest": ["gtest::gtest"], "pybind11": ["pybind11::module"]}
  },
  "baremetal_white_list": ["etl", "ArduinoJson"],
  "graphviz_bin": "/usr/bin",
  "doc_languages": ["en", "zh"],
  "doc_versions": ["1.0", "2.0"],
  "doc_doxygen_folders": ["include", "src", "docs/doxygen/dox"],
  "doc_doxygen_suffix": ["h", "c", "hpp", "cpp", "dox", "cxx"],
  "trigger_tests": true,
  "saving_tests_log": true,
  "enable_python_bindings": false,
  "workflow_triggers": {
    "build": true,
    "tests": true,
    "release": false,
    "docs": false,
    "security_scan": true
  }
}
`;

describe('V5-3 metadataText (human-readable metadata writers)', () => {
  it('fcppStyleStringify keeps scalar arrays inline and 2-space indent', () => {
    const s = fcppStyleStringify({ a: ['x', 'y'], b: { c: 'd' }, n: 1 });
    const lines = s.split('\n');
    assert.ok(lines.some((l) => l.includes('"a": ["x", "y"]')));
    assert.ok(lines.some((l) => l.includes('"b": {"c": "d"}')));
    assert.ok(lines[0] === '{');
    assert.ok(lines[lines.length - 1] === '}');
  });

  it('surgicalPatch changes only the targeted fields (name/description/flag)', () => {
    const out = surgicalPatch(TPL, {
      name: 'my_lib',
      description: 'A small library',
      activate_code_coverage: false,
    });
    assert.strictEqual(out.method, 'surgical');
    const parsed = JSON.parse(out.text) as Record<string, unknown>;
    assert.strictEqual(parsed.name, 'my_lib');
    assert.strictEqual(parsed.description, 'A small library');
    assert.strictEqual(parsed.activate_code_coverage, false);
    // Untouched rows keep their original formatting byte-for-byte.
    assert.ok(out.text.includes('"authors": ["Chen Zhang <chen2.zhang@szhittech.com>"],'));
    assert.ok(out.text.includes('"common": {"ZLIB": ["ZLIB::ZLIB"]},'));
    assert.ok(out.text.includes('"etl": ["etl::etl"]'));
    assert.ok(out.text.includes('"cmake_version": "4.0.1",'));
    // Only the three keys' lines differ from the original.
    const changedLines = out.text.split('\n').filter((l, i) => l !== TPL.split('\n')[i]);
    assert.strictEqual(changedLines.length, 3, changedLines.join('\n'));
  });

  it('inserts a missing top-level field above dependencies', () => {
    const out = surgicalPatch(TPL, { toolchain: 'managed' });
    assert.strictEqual(out.method, 'surgical');
    assert.ok(out.text.includes('  "toolchain": "managed",\n  "dependencies": {'));
    assert.strictEqual((JSON.parse(out.text) as Record<string, unknown>).toolchain, 'managed');
  });

  it('replaces a multi-line object field and preserves the rest', () => {
    const out = surgicalPatch(TPL, { workflow_triggers: { build: true, tests: true, release: true, docs: false, security_scan: true } });
    assert.strictEqual(out.method, 'surgical');
    const parsed = JSON.parse(out.text) as { workflow_triggers: Record<string, boolean> };
    assert.strictEqual(parsed.workflow_triggers.release, true);
    assert.ok(out.text.includes('"release": true'));
    assert.ok(out.text.includes('"dependencies": {'));
    assert.ok(out.text.includes('"authors": ["Chen Zhang <chen2.zhang@szhittech.com>"],'));
  });

  it('replaces an inline array field (authors)', () => {
    const out = surgicalPatch(TPL, { authors: ['New <new@het.dev>'] });
    assert.strictEqual(out.method, 'surgical');
    assert.ok(out.text.includes('  "authors": ["New <new@het.dev>"],'));
    assert.strictEqual((JSON.parse(out.text) as { authors: string[] }).authors[0], 'New <new@het.dev>');
  });

  it('falls back to an fcpp-style rewrite for single-line JSON', () => {
    const out = surgicalPatch('{"name":"a","version":"1"}', { name: 'b', toolchain: 'managed' });
    assert.strictEqual(out.method, 'rewrite');
    const parsed = JSON.parse(out.text) as Record<string, unknown>;
    assert.strictEqual(parsed.name, 'b');
    assert.strictEqual(parsed.toolchain, 'managed');
    assert.strictEqual(parsed.version, '1');
  });
});
