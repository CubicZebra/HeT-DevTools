import * as assert from 'node:assert';
import { CURATED_PACKAGES } from '../data/conanIndex';

describe('conanIndex (V2-3 offline curated index)', () => {
  it('contains at least 20 curated packages', () => {
    assert.ok(CURATED_PACKAGES.length >= 20, `expected >= 20, got ${CURATED_PACKAGES.length}`);
  });
  it('has unique conan names', () => {
    assert.strictEqual(new Set(CURATED_PACKAGES.map((p) => p.conan)).size, CURATED_PACKAGES.length);
  });
  it('every entry has versions, a valid bucket and a note', () => {
    const buckets = new Set(['common', 'c', 'cpp', 'infra']);
    for (const p of CURATED_PACKAGES) {
      assert.ok(p.conan.length > 0);
      assert.ok(p.versions.length > 0, `${p.conan} needs versions`);
      assert.ok(buckets.has(p.bucket), `${p.conan} bucket=${p.bucket}`);
      assert.ok(p.note.length > 0);
    }
  });
  it('covers representative families used by fcpp modules', () => {
    const names = CURATED_PACKAGES.map((p) => p.conan);
    for (const want of ['zlib', 'eigen', 'fmt', 'spdlog', 'nlohmann_json', 'gtest', 'pybind11']) {
      assert.ok(names.includes(want), `missing curated entry: ${want}`);
    }
  });
});
