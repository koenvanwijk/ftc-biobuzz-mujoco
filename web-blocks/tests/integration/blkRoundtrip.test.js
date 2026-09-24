import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('.blk examples', () => {
  for (const name of [
    'StarterBot_TankDrive.blk',
    'StarterBot_Mechanisms.blk',
    'StarterBot_EncoderAuto.blk',
    'StarterBot_ImuAprilTag.blk',
  ]) {
    it(`${name} has Blockly xml + Extra xml and exact config ids`, () => {
      const text = fs.readFileSync(path.join(root, 'examples', name), 'utf8');
      assert.ok(text.includes('<xml'));
      assert.ok(text.includes('</xml>'));
      assert.ok(text.includes('<Extra>'));
      assert.ok(text.includes('runOpMode'));
      assert.ok(
        text.includes('leftDriveAsDcMotor') ||
          text.includes('flywheelAsDcMotor') ||
          text.includes('imuAsIMU'),
      );
      if (name.includes('Tank')) {
        assert.ok(text.includes('leftDriveAsDcMotor'));
        assert.ok(text.includes('rightDriveAsDcMotor'));
        assert.ok(text.includes('CurrentPosition'));
      }
      if (name.includes('Mechanisms')) {
        assert.ok(text.includes('flywheelAsDcMotor'));
        assert.ok(text.includes('intakeMotorAsDcMotor'));
        assert.ok(text.includes('pollenServoAsServo'));
        assert.ok(text.includes('crServoAsCRServo'));
      }
      if (name.includes('Encoder')) {
        assert.ok(text.includes('RUN_TO_POSITION'));
        assert.ok(text.includes('STOP_AND_RESET_ENCODER'));
      }
      if (name.includes('ImuAprilTag')) {
        assert.ok(text.includes('imuAsIMU'));
        assert.ok(text.includes('aprilTagProcessor'));
        assert.ok(text.includes('visionPortal'));
        assert.ok(text.includes('Webcam 1'));
      }
    });
  }
});
