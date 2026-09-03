import * as assert from 'node:assert';
import { join } from 'node:path';
import { detectFcppProject, detectProjectsIn } from '../core/projectDetector';
import { pathExists } from '../utils/fs';

const fixtures = join(__dirname, '..', '..', 'src', 'test', 'fixtures');
// __dirname = out/test, fixtures live at src/test/fixtures relative to repo root.
const repoRoot = join(__dirname, '..', '..');
const realFcpp = join(repoRoot, 'workspace', 'fcpp');

describe('projectDetector', () => {
  it('L1 full: mini-fcpp fixture (metadata + conanfile + CMakeLists)', async () => {
    const p = await detectFcppProject(join(fixtures, 'mini-fcpp'));
    assert.ok(p);
    assert.strictEqual(p?.level, 'full');
    assert.strictEqual(p?.metadata?.name, 'mini-fcpp');
    assert.strictEqual(p?.metadataError, undefined);
  });

  it('L2 partial: only metadata.json', async () => {
    const p = await detectFcppProject(join(fixtures, 'partial-project'));
    assert.ok(p);
    assert.strictEqual(p?.level, 'partial');
    assert.strictEqual(p?.metadata?.name, 'partial-fcpp');
  });

  it('L3 trace: only conandata.yml', async () => {
    const p = await detectFcppProject(join(fixtures, 'trace-project'));
    assert.ok(p);
    assert.strictEqual(p?.level, 'trace');
    assert.strictEqual(p?.metadata, undefined);
  });

  it('L3 trace: only .github/skills folder', async () => {
    const p = await detectFcppProject(join(fixtures, 'skills-trace'));
    assert.ok(p);
    assert.strictEqual(p?.level, 'trace');
  });

  it('returns undefined for a non-fcpp folder', async () => {
    const p = await detectFcppProject(join(repoRoot, 'node_modules'));
    assert.strictEqual(p, undefined);
  });

  it('detectProjectsIn handles multiple roots independently', async () => {
    const found = await detectProjectsIn([
      join(fixtures, 'mini-fcpp'),
      join(repoRoot, 'node_modules'),
      join(fixtures, 'trace-project'),
    ]);
    assert.strictEqual(found.length, 2);
    assert.deepStrictEqual(found.map((f) => f.level).sort(), ['full', 'trace']);
  });

  it('parses the real local fcpp reference when present', async function () {
    if (!(await pathExists(join(realFcpp, 'metadata.json')))) {
      this.skip();
      return;
    }
    const p = await detectFcppProject(realFcpp);
    assert.ok(p);
    assert.strictEqual(p?.level, 'full');
    assert.strictEqual(p?.metadata?.name, 'fcpp');
  });
});
