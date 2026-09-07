import * as assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FcppMetadata } from '../types';
import { pathExists, readJson, readText, writeJson, writeText } from '../utils/fs';
import { applyMetadataPatch, diffMetadata, validateMetadata } from '../core/metadataService';
import { fcppStyleStringify } from '../core/metadataText';

function baseMetadata(): FcppMetadata {
  return {
    name: 'demo',
    version: '0.1.0',
    build_type: 'Debug',
    build_cppstd: '17',
    build_cstd: '11',
    is_shared: false,
    is_header: false,
    activate_code_coverage: false,
    doc_languages: ['en', 'zh'],
    doc_versions: ['1.0'],
    dependencies: {
      common: { ZLIB: ['ZLIB::ZLIB'] },
      c: {},
      cpp: { Eigen3: ['Eigen3::Eigen'] },
      infra: { GTest: ['gtest::gtest'] },
    },
    workflow_triggers: { build: true, tests: true, release: false, docs: false, security_scan: true },
  };
}

function makeRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'het-meta-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('metadataService.validateMetadata', () => {
  it('accepts a valid document', () => {
    const issues = validateMetadata(baseMetadata());
    assert.strictEqual(issues.filter((i) => i.severity === 'error').length, 0);
  });

  it('rejects bad build_cppstd / build_type / missing name', () => {
    const issues = validateMetadata({ ...baseMetadata(), name: '  ', build_cppstd: '99', build_type: 'Fast' });
    const fields = issues.filter((i) => i.severity === 'error').map((i) => i.field);
    assert.ok(fields.includes('name'));
    assert.ok(fields.includes('build_cppstd'));
    assert.ok(fields.includes('build_type'));
  });

  it('rejects GTest outside the infra bucket', () => {
    const issues = validateMetadata({
      ...baseMetadata(),
      dependencies: { common: {}, c: {}, cpp: { GTest: ['gtest::gtest'] }, infra: {} },
    });
    assert.ok(issues.some((i) => i.field?.includes('GTest') && i.severity === 'error'));
  });

  it('rejects one package living in two buckets (case-insensitive)', () => {
    const issues = validateMetadata({
      ...baseMetadata(),
      dependencies: { common: { zlib: ['ZLIB::ZLIB'] }, c: { ZLIB: ['ZLIB::ZLIB'] }, cpp: {}, infra: {} },
    });
    assert.ok(issues.some((i) => i.message.includes('同时出现在') && i.severity === 'error'));
  });

  it('rejects pybind11 in a main-package bucket without enable_python_bindings', () => {
    const issues = validateMetadata({
      ...baseMetadata(),
      dependencies: { common: {}, c: {}, cpp: { pybind11: ['pybind11::module'] }, infra: {} },
    });
    assert.ok(issues.some((i) => i.message.includes('enable_python_bindings')));
  });

  it('allows pybind11 in infra even when the switch is off (host test facility)', () => {
    const issues = validateMetadata({
      ...baseMetadata(),
      dependencies: { common: {}, c: {}, cpp: {}, infra: { pybind11: ['pybind11::module'] } },
    });
    assert.ok(!issues.some((i) => i.message.includes('enable_python_bindings')), 'infra pybind11 must be accepted');
  });

  it('warns when all CI switches are off', () => {
    const issues = validateMetadata({
      ...baseMetadata(),
      workflow_triggers: { build: false, tests: false, release: false, docs: false, security_scan: false },
    });
    assert.ok(issues.some((i) => i.field === 'workflow_triggers' && i.severity === 'warning'));
  });
});

describe('metadataService.diffMetadata', () => {
  it('lists changed/added/removed fields', () => {
    const oldObj = baseMetadata();
    const next = { ...oldObj, build_type: 'Release', extra: true } as FcppMetadata;
    delete (next as Record<string, unknown>).doc_versions;
    const diff = diffMetadata(oldObj, next);
    const fields = new Set(diff.map((d) => d.field));
    assert.ok(fields.has('build_type'));
    assert.ok(fields.has('extra'));
    assert.ok(fields.has('doc_versions'));
  });
});

describe('metadataService.applyMetadataPatch', () => {
  it('dry-run preview validates + diffs but does not write', async () => {
    const { root, cleanup } = makeRoot();
    try {
      await writeJson(join(root, 'metadata.json'), baseMetadata());
      const res = await applyMetadataPatch(root, { build_type: 'Release' });
      assert.strictEqual(res.ok, true);
      const build = res.diff.find((d) => d.field === 'build_type');
      assert.strictEqual(build?.oldValue, 'Debug');
      assert.strictEqual(build?.newValue, 'Release');
      // nothing persisted
      assert.ok(!(await pathExists(join(root, 'metadata.json.bak'))));
      const onDisk = (await readJson(join(root, 'metadata.json'))) as { build_type: string };
      assert.strictEqual(onDisk.build_type, 'Debug');
    } finally {
      cleanup();
    }
  });

  it('persists a valid patch surgically (no .bak, formatting preserved)', async () => {
    const { root, cleanup } = makeRoot();
    try {
      const original = fcppStyleStringify(baseMetadata());
      await writeText(join(root, 'metadata.json'), original);
      const res = await applyMetadataPatch(root, { build_type: 'Release' }, { persist: true });
      assert.strictEqual(res.ok, true);
      const text = await readText(join(root, 'metadata.json'));
      assert.strictEqual((JSON.parse(text) as { build_type: string }).build_type, 'Release');
      assert.ok(!(await pathExists(join(root, 'metadata.json.bak'))), 'no .bak backup is written');
      // Untouched rows keep their original fcpp formatting byte-for-byte.
      assert.ok(text.includes('"common": {"ZLIB": ["ZLIB::ZLIB"]}'), 'compact deps style preserved');
      assert.ok(text.includes('"authors"') === original.includes('"authors"'));
      const changed = text.split('\n').filter((l, i) => l !== original.split('\n')[i]);
      assert.strictEqual(changed.length, 1, changed.join('\n'));
      assert.ok(changed[0].includes('"build_type": "Release"'));
    } finally {
      cleanup();
    }
  });

  it('refuses an invalid patch with field-level issues and leaves the file untouched', async () => {
    const { root, cleanup } = makeRoot();
    try {
      await writeJson(join(root, 'metadata.json'), baseMetadata());
      const res = await applyMetadataPatch(root, { build_cppstd: '99' }, { persist: true });
      assert.strictEqual(res.ok, false);
      assert.ok(res.issues.some((i) => i.field === 'build_cppstd' && i.severity === 'error'));
      assert.ok(!(await pathExists(join(root, 'metadata.json.bak'))));
      const onDisk = (await readJson(join(root, 'metadata.json'))) as { build_cppstd: string };
      assert.strictEqual(onDisk.build_cppstd, '17');
    } finally {
      cleanup();
    }
  });
});
