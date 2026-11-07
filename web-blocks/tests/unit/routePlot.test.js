import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RouteTracker, gradientRgb, distanceColor, niceTicks } from '../../src/ui/routePlot.js';

describe('RouteTracker', () => {
  it('accumuleert afgelegde afstand', () => {
    const t = new RouteTracker({ minStep: 0 });
    t.add(0, 0); t.add(1, 0); t.add(1, 1); t.add(0, 1);
    assert.equal(t.total, 3);
    assert.deepEqual(t.points.map((p) => p.d), [0, 1, 2, 3]);
  });
  it('slaat te kleine stappen over maar updatet huidige pose', () => {
    const t = new RouteTracker({ minStep: 0.01 });
    t.add(0, 0); t.add(0.001, 0, 1);
    assert.equal(t.points.length, 1);
    assert.equal(t.current.yaw, 1);
  });
  it('negeert NaN en reset leegt alles', () => {
    const t = new RouteTracker();
    assert.equal(t.add(NaN, 0), false);
    t.add(0, 0); t.add(2, 0); t.reset();
    assert.equal(t.points.length, 0); assert.equal(t.total, 0); assert.equal(t.current, null);
  });
  it('decimeert bij maxPoints zonder totaal te verliezen', () => {
    const t = new RouteTracker({ minStep: 0, maxPoints: 10 });
    for (let i = 0; i <= 20; i++) t.add(i * 0.1, 0);
    assert.ok(t.points.length <= 10);
    assert.ok(Math.abs(t.points.at(-1).d - 2) < 1e-9);
  });
});

describe('gradient', () => {
  it('blauw -> geel -> rood', () => {
    assert.deepEqual(gradientRgb(0), [30, 90, 255]);
    assert.deepEqual(gradientRgb(0.5), [255, 220, 0]);
    assert.deepEqual(gradientRgb(1), [230, 30, 30]);
    assert.deepEqual(gradientRgb(-1), gradientRgb(0));
    assert.deepEqual(gradientRgb(2), gradientRgb(1));
  });
  it('distanceColor met max 0 is beginkleur', () => {
    assert.equal(distanceColor(5, 0), 'rgb(30,90,255)');
    assert.equal(distanceColor(2, 4), 'rgb(255,220,0)');
  });
  it('niceTicks', () => {
    assert.deepEqual(niceTicks(-1.83, 1.83, 0.5), [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
  });
});
