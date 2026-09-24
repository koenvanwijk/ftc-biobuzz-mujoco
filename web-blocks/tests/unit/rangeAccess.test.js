import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rangeAccess, clip, scale } from '../../src/ftc-runtime/rangeAccess.js';

describe('rangeAccess', () => {
  it('clip clamps to [min, max]', () => {
    assert.equal(clip(5, 0, 10), 5);
    assert.equal(clip(-1, 0, 10), 0);
    assert.equal(clip(99, 0, 10), 10);
    assert.equal(rangeAccess.clip(3, 1, 2), 2);
  });

  it('scale maps linearly and handles x1===x2', () => {
    assert.equal(scale(0.5, 0, 1, 0, 100), 50);
    assert.equal(scale(0, 0, 1, 10, 20), 10);
    assert.equal(scale(1, 0, 1, 10, 20), 20);
    assert.equal(scale(5, 5, 5, 7, 9), 7);
    assert.equal(rangeAccess.scale(-1, -1, 1, 0, 1), 0);
  });
});
