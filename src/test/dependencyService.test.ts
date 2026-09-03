import * as assert from 'node:assert';
import { FcppMetadata } from '../types';
import {
  parseRequirements,
  removeRequirement,
  renderRequirement,
  upsertRequirement,
} from '../core/conandataService';
import {
  addDependency,
  displayKeyFor,
  listDependencies,
  removeDependency,
} from '../core/dependencyService';

const CONANDATA = `# This file is managed by Conan, contents will be overwritten.
requirements:
  - "gtest/1.16.0"
  - "pybind11/3.0.1"
  - "zlib/1.3.1"
`;

function meta(): FcppMetadata {
  return {
    name: 'demo',
    version: '0.1.0',
    build_type: 'Debug',
    build_cppstd: '17',
    dependencies: {
      common: { ZLIB: ['ZLIB::ZLIB'] },
      c: {},
      cpp: { Eigen3: ['Eigen3::Eigen'] },
      infra: { GTest: ['gtest::gtest'] },
    },
    workflow_triggers: { build: true },
  };
}

describe('conandataService', () => {
  it('parses requirements and skips the header comment', () => {
    const reqs = parseRequirements(CONANDATA);
    assert.deepStrictEqual(
      reqs.map((r) => r.pkg),
      ['gtest', 'pybind11', 'zlib'],
    );
    assert.strictEqual(reqs[0].version, '1.16.0');
  });

  it('upserts an existing requirement (replaces version, keeps position)', () => {
    const { text, replaced } = upsertRequirement(CONANDATA, 'zlib', '1.3.2');
    assert.strictEqual(replaced, true);
    const reqs = parseRequirements(text);
    const zlib = reqs.find((r) => r.pkg === 'zlib');
    assert.strictEqual(zlib?.version, '1.3.2');
  });

  it('appends a new requirement after the last one, preserving header', () => {
    const { text, replaced } = upsertRequirement(CONANDATA, 'fmt', '11.1.4');
    assert.strictEqual(replaced, false);
    assert.ok(text.startsWith('# This file is managed by Conan'));
    const reqs = parseRequirements(text);
    assert.strictEqual(reqs[reqs.length - 1].pkg, 'fmt');
    assert.strictEqual(reqs[reqs.length - 1].version, '11.1.4');
  });

  it('removes a requirement by package name', () => {
    const { text, removed } = removeRequirement(CONANDATA, 'pybind11');
    assert.strictEqual(removed, true);
    assert.ok(!parseRequirements(text).some((r) => r.pkg === 'pybind11'));
    assert.ok(text.includes('gtest/1.16.0'));
  });

  it('renderRequirement uses the canonical style', () => {
    assert.strictEqual(renderRequirement('fmt', '11.0.0'), '  - "fmt/11.0.0"');
  });
});

describe('dependencyService', () => {
  it('maps conan names to canonical display keys', () => {
    assert.strictEqual(displayKeyFor('zlib'), 'ZLIB');
    assert.strictEqual(displayKeyFor('eigen'), 'Eigen3');
    assert.strictEqual(displayKeyFor('fmt'), 'fmt');
  });

  it('adds a new dependency to both files consistently', () => {
    const res = addDependency(meta(), CONANDATA, { conanName: 'fmt', version: '11.1.4', bucket: 'cpp' });
    assert.strictEqual(res.ok, true);
    assert.ok(res.nextMetadata);
    assert.strictEqual(res.nextMetadata?.dependencies?.cpp?.fmt?.join(), 'fmt::fmt');
    assert.ok(res.nextConandataText?.includes('"fmt/11.1.4"'));
    const issues = res.nextMetadata ? [] : [];
    assert.deepStrictEqual(issues, []);
  });

  it('rejects a duplicate dependency', () => {
    const res = addDependency(meta(), CONANDATA, { conanName: 'zlib', version: '1.3.1', bucket: 'common' });
    assert.strictEqual(res.ok, false);
    assert.ok(res.issues[0].includes('已存在'));
  });

  it('forces gtest into infra and rejects pybind11 without the switch', () => {
    const noGtest = meta();
    delete noGtest.dependencies?.infra?.GTest;
    const forced = addDependency(noGtest, CONANDATA, { conanName: 'gtest', version: '1.17.0', bucket: 'cpp' });
    assert.strictEqual(forced.ok, true);
    assert.strictEqual(forced.nextMetadata?.dependencies?.cpp?.GTest, undefined);
    assert.ok(forced.nextMetadata?.dependencies?.infra?.GTest);

    const py = addDependency(meta(), CONANDATA, { conanName: 'pybind11', version: '3.0.1', bucket: 'cpp' });
    assert.strictEqual(py.ok, false);
    assert.ok(py.issues[0].includes('enable_python_bindings'));
  });

  it('removes a dependency from both files', () => {
    const res = removeDependency(meta(), CONANDATA, { bucket: 'common', displayKey: 'ZLIB' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.nextMetadata?.dependencies?.common?.ZLIB, undefined);
    assert.ok(!res.nextConandataText?.includes('zlib/'));
  });

  it('lists dependencies with versions from conandata', () => {
    const view = listDependencies(meta(), CONANDATA);
    const zlib = view.find((d) => d.displayKey === 'ZLIB');
    assert.strictEqual(zlib?.version, '1.3.1');
    assert.strictEqual(zlib?.bucket, 'common');
    assert.strictEqual(view.length, 3);
  });
});
