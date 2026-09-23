import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mapIntakePower,
  mapFlywheelEdge,
  mapPollenServoEdge,
  DEFAULT_THRESHOLDS,
} from '../../src/mujoco/biobuzzMapping.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('BIOBUZZ soft mapping', () => {
  it('intakeMotor sign + crServo override', () => {
    assert.equal(mapIntakePower(0.5, 0), 1);
    assert.equal(mapIntakePower(-0.5, 0), -1);
    assert.equal(mapIntakePower(0, 0), 0);
    assert.equal(mapIntakePower(1, 0.5), -1); // crServo forces reverse
    assert.equal(mapIntakePower(0.01, 0), 0); // below threshold
  });

  it('flywheel rising-edge shoot', () => {
    assert.deepEqual(mapFlywheelEdge(0.5, false), { fire: true, armed: true });
    assert.deepEqual(mapFlywheelEdge(0.5, true), { fire: false, armed: true });
    assert.deepEqual(mapFlywheelEdge(0.1, true), { fire: false, armed: false });
  });

  it('pollenServo rising-edge place', () => {
    assert.deepEqual(mapPollenServoEdge(0.8, false), { place: true, armed: true });
    assert.deepEqual(mapPollenServoEdge(0.8, true), { place: false, armed: true });
    assert.deepEqual(mapPollenServoEdge(0.5, true), { place: false, armed: false });
  });

  it('simulation.json documents mapping + thresholds', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(root, 'robots/BIOBUZZ/simulation.json'), 'utf8'),
    );
    assert.equal(cfg.world, 'biobuzz');
    assert.equal(cfg.drive.left.actuator, 'left_drive');
    assert.equal(cfg.drive.right.actuator, 'right_drive');
    assert.equal(cfg.motors.flywheel.softMechanism, 'IntakeShooter.fire');
    assert.equal(cfg.motors.intakeMotor.softMechanism, 'IntakeShooter.intakePower');
    assert.equal(cfg.servos.pollenServo.softMechanism, 'IntakeShooter.tryPlaceNectar');
    assert.equal(cfg.thresholds.flywheelShoot, DEFAULT_THRESHOLDS.flywheelShoot);
    assert.ok(fs.existsSync(path.join(root, 'public/assets/biobuzz_scene.xml')));
    assert.ok(fs.existsSync(path.join(root, 'public/assets/meshes/hive_frame.stl')));
  });
});
