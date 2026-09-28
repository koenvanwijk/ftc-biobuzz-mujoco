import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BiobuzzHardwareAdapter } from '../../src/mujoco/BiobuzzHardwareAdapter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('BIOBUZZ tank encoder direction', () => {
  it('normalizes the reversed right encoder to positive logical forward ticks', () => {
    const fake = {
      _motorMeta: {
        rightDriveAsDcMotor: {
          kind: 'drive',
          qposAdr: 0,
          qvelAdr: 0,
          invert: true,
          ticksPerRad: 1,
          mode: 'RUN_TO_POSITION',
          target: 1000,
          tol: 10,
          encoderOffset: 0,
          directionSign: -1,
        },
      },
      data: {
        qpos: new Float64Array([1000]),
        qvel: new Float64Array([100]),
      },
    };

    const sensor = BiobuzzHardwareAdapter.prototype._motorSensor.call(
      fake,
      'rightDriveAsDcMotor',
    );

    // Raw motor encoder is negative because the physical right motor is mirrored.
    assert.equal(sensor.positionTicks, -1000);
    assert.equal(sensor.velocityTicksPerSec, -100);
    // directionSign=-1 converts that raw value back to logical +1000 for busy.
    assert.equal(sensor.busy, false);
  });

  it('RUN_TO_POSITION drives a REVERSE motor toward a positive logical target', () => {
    const fake = {
      _motorSensor: () => ({
        positionTicks: -400,
        velocityTicksPerSec: 0,
        busy: true,
      }),
    };
    const meta = {
      directionSign: -1,
      tol: 10,
      ticksPerRad: 1,
      maxRadPerSec: 10,
    };
    const cmd = {
      jsId: 'rightDriveAsDcMotor',
      mode: 'RUN_TO_POSITION',
      targetPosition: 1000,
      targetTolerance: 10,
      encoderOffsetTicks: 0,
      directionSign: -1,
    };

    const electricalPower = BiobuzzHardwareAdapter.prototype._motorPower01.call(
      fake,
      cmd,
      meta,
    );

    // Logical position is +400, so it must keep moving toward +1000.
    // Electrical/raw command is negative because Direction.REVERSE is active.
    assert.equal(electricalPower, -1);
  });

  it('config models the mirrored right encoder polarity', () => {
    const sourceCfg = JSON.parse(
      readFileSync(join(root, 'robots/BIOBUZZ/simulation.json'), 'utf8'),
    );
    const publicCfg = JSON.parse(
      readFileSync(join(root, 'public/robots/BIOBUZZ/simulation.json'), 'utf8'),
    );

    assert.equal(sourceCfg.drive.left.invertEncoder, false);
    assert.equal(sourceCfg.drive.right.invertEncoder, true);
    assert.equal(sourceCfg.drive.right.defaultDirection, 'REVERSE');
    assert.deepEqual(publicCfg.drive, sourceCfg.drive);
  });

  it('Blocks worker publishes directionSign with motor commands', () => {
    const worker = readFileSync(join(root, 'src/execution/opModeWorker.js'), 'utf8');
    assert.match(worker, /directionSign:\s*dirSign\(\)/);
  });
});
