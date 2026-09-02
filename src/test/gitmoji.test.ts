import * as assert from 'node:assert';
import { CONVENTIONAL_TYPES, PIPELINE_TRIGGERS, findPipeline, findType } from '../utils/gitmoji';

describe('gitmoji', () => {
  it('pipeline keys and codes are unique', () => {
    assert.strictEqual(new Set(PIPELINE_TRIGGERS.map((p) => p.key)).size, PIPELINE_TRIGGERS.length);
    assert.strictEqual(new Set(PIPELINE_TRIGGERS.map((p) => p.code)).size, PIPELINE_TRIGGERS.length);
  });

  it('contains every fcpp-documented trigger code', () => {
    const codes = [
      ':building_construction:',
      ':beer:',
      ':package:',
      ':book:',
      ':shield:',
      ':fire:',
    ];
    for (const code of codes) {
      assert.ok(PIPELINE_TRIGGERS.some((p) => p.code === code), `missing ${code}`);
    }
  });

  it('covers the 10 conventional types', () => {
    assert.strictEqual(CONVENTIONAL_TYPES.length, 10);
    assert.ok(findType('feat'));
    assert.ok(findType('chore'));
  });

  it('exposes gates and switch-free triggers', () => {
    assert.strictEqual(findPipeline('release')?.gate, 'workflow_triggers.release');
    assert.strictEqual(findPipeline('board')?.gate, undefined);
  });
});
