import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DcMotorBridge, wrapDcMotor } from '../../src/ftc-runtime/dcMotor.js';

function make() {
  const cmds = [];
  let sensor = { positionTicks: 100, velocityTicksPerSec: 0, busy: false };
  const motor = wrapDcMotor(
    new DcMotorBridge('leftDriveAsDcMotor', {
      publishCommand: (c) => cmds.push(c),
      readSensor: () => sensor,
      limits: { maxRadPerSec: 10, ticksPerRad: 50 },
    }),
  );
  return { motor, cmds, setSensor: (s) => { sensor = s; } };
}

describe('DcMotorBridge', () => {
  it('setPower publishes signed power', () => {
    const { motor, cmds } = make();
    motor.setDirection('REVERSE');
    motor.setPower(0.5);
    const last = cmds.at(-1);
    assert.equal(last.power, -0.5);
  });

  it('STOP_AND_RESET_ENCODER offsets position', () => {
    const { motor, setSensor } = make();
    setSensor({ positionTicks: 200, velocityTicksPerSec: 0, busy: false });
    motor.setMode('STOP_AND_RESET_ENCODER');
    assert.equal(motor.getCurrentPosition(), 0);
  });

  it('setDualPower updates both', () => {
    const a = make();
    const b = make();
    a.motor.setDualPower(0.2, b.motor, -0.3);
    assert.equal(a.motor.getPower(), 0.2);
    assert.equal(b.motor.getPower(), -0.3);
  });

  it('unsupported PIDF throws', () => {
    const { motor } = make();
    assert.throws(() => motor.setVelocityPIDFCoefficients(1, 2, 3, 4), /Niet ondersteund/);
  });
});
