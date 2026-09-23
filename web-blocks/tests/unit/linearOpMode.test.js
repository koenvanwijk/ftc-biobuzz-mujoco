import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SimClock } from '../../src/ftc-runtime/simClock.js';
import { LinearOpModeBridge } from '../../src/ftc-runtime/linearOpMode.js';

describe('LinearOpMode + SimClock', () => {
  it('waitForStart blocks until signalStart', () => {
    const clock = new SimClock();
    const lom = new LinearOpModeBridge(clock);
    lom.resetForInit();
    lom.beginWaitForStart();
    assert.equal(lom.pollWaits(), false);
    assert.equal(lom.opModeIsActive(), false);
    lom.signalStart();
    assert.equal(lom.pollWaits(), true);
    assert.equal(lom.opModeIsActive(), true);
  });

  it('sleep uses sim clock not wall clock', () => {
    const clock = new SimClock();
    const lom = new LinearOpModeBridge(clock);
    lom.signalStart();
    lom.beginSleep(500);
    assert.equal(lom.pollWaits(), false);
    clock.advance(0.4);
    assert.equal(lom.pollWaits(), false);
    clock.advance(0.2);
    assert.equal(lom.pollWaits(), true);
  });

  it('STOP clears waits', () => {
    const clock = new SimClock();
    const lom = new LinearOpModeBridge(clock);
    lom.beginWaitForStart();
    lom.signalStop();
    assert.equal(lom.isStopRequested(), true);
    assert.equal(lom.pollWaits(), true);
    assert.equal(lom.opModeIsActive(), false);
  });
});
