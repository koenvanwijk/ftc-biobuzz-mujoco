import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { miscAccess } from '../../src/ftc-runtime/helpers.js';

describe('miscAccess formatting helpers', () => {
  it('formatNumber uses fixed decimal precision', () => {
    assert.equal(miscAccess.formatNumber(12.345, 2), '12.35');
  });

  it('formatNumber_withWidth left-pads the fixed number', () => {
    assert.equal(miscAccess.formatNumber_withWidth(12.345, 8, 2), '   12.35');
    assert.equal(miscAccess.formatNumber_withWidth(1234.5, 4, 1), '1234.5');
  });
});
