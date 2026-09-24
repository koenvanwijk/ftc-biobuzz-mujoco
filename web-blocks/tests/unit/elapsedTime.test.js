import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElapsedTimeAccess } from '../../src/ftc-runtime/elapsedTime.js';
import { createSystemAccess } from '../../src/ftc-runtime/systemAccess.js';

describe('elapsedTimeAccess (mockable sim clock)', () => {
  it('tracks elapsed seconds from a mock clock', () => {
    let t = 1.5;
    const access = createElapsedTimeAccess(() => t);
    const timer = access.create();
    assert.equal(access.getSeconds(timer), 0);
    t = 3.5;
    assert.equal(access.getSeconds(timer), 2);
    assert.equal(access.getMilliseconds(timer), 2000);
    assert.equal(access.getTime(timer), 2);
    access.reset(timer);
    assert.equal(access.getSeconds(timer), 0);
    t = 4.0;
    assert.equal(access.getSeconds(timer), 0.5);
  });

  it('create_withResolution MILLISECONDS affects getTime', () => {
    let t = 0;
    const access = createElapsedTimeAccess(() => t);
    const timer = access.create_withResolution('MILLISECONDS');
    t = 0.25;
    assert.equal(access.getTime(timer), 250);
    assert.equal(access.getResolution(timer), 'MILLISECONDS');
  });

  it('create_withStartTime accepts nanoseconds when huge', () => {
    let t = 10;
    const access = createElapsedTimeAccess(() => t);
    // Values > 1e12 are treated as System.nanoTime()-style nanoseconds.
    const timer = access.create_withStartTime(5e12); // 5000 s in ns → startSec=5000
    assert.equal(access.getSeconds(timer), 10 - 5000);
    const asSeconds = access.create_withStartTime(8); // small → seconds
    assert.equal(access.getSeconds(asSeconds), 2);
  });

  it('systemAccess uses the same sim clock', () => {
    let t = 2.5;
    const sys = createSystemAccess(() => t);
    assert.equal(sys.nanoTime(), 2500000000);
    assert.equal(sys.currentTimeMillis(), 2500);
  });
});
