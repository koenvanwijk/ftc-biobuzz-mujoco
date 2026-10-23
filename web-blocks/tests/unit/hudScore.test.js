import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, hudScoreTotals, SCORE_POINTS } from '../../src/worlds/biobuzz/scoring.js';

describe('HUD/telemetry score = TU03 total (not only TIP points)', () => {
  it('2 TIPs + 4 GARDEN: telemetry shows the full total, like the score panel', () => {
    const score = computeScore({ tips: { red: 2, blue: 0 }, cell: { red: 0, blue: 0 }, garden: { red: 4, blue: 0 }, flowers: [], robots: [] });
    const tipOnly = { red: 2 * SCORE_POINTS.TIP, blue: 0 };
    const h = hudScoreTotals(score, tipOnly);
    assert.equal(h.scoreRed, score.red.total);
    assert.equal(h.scoreRed, 2 * SCORE_POINTS.TIP + 4 * SCORE_POINTS.GARDEN);
    assert.notEqual(h.scoreRed, tipOnly.red);
    assert.equal(h.scoreBlue, 0);
  });
  it('falls back to TIP points when no score is available yet', () => {
    assert.deepEqual(hudScoreTotals(null, { red: 20, blue: 0 }), { scoreRed: 20, scoreBlue: 0 });
    assert.deepEqual(hudScoreTotals(null), { scoreRed: 0, scoreBlue: 0 });
  });
});
