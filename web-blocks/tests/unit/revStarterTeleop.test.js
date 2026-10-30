/** REV Starter Bot TeleOp 2026 (origineel REV-Blocks-voorbeeld) als apart programma in de BIOBUZZ-sim. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLY_MAX_TICKS_PER_S,
  flywheelAtSpeed,
  flywheelTarget,
} from '../../src/mujoco/BiobuzzHardwareAdapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blk = fs.readFileSync(path.join(root, 'examples/REVStarterBotTeleOp2026.blk'), 'utf8');

describe('REVStarterBotTeleOp2026.blk', () => {
  it('TELEOP, in de keuzelijst, los van ImuHiveAuto', () => {
    assert.match(blk, /flavor="TELEOP"/);
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /value="REVStarterBotTeleOp2026\.blk"/);
    for (const p of ['intakeControls', 'flywheelControls', 'pollenPoker', 'arcadeDrive', 'runOpMode']) {
      assert.ok(blk.includes(`<field name="NAME">${p}</field>`), p);
    }
  });

  it('gebruikt alleen sim-hardware (REVStarterBot2026-config)', () => {
    const ids = new Set([...blk.matchAll(/<field name="IDENTIFIER\d?">(\w+)<\/field>/g)].map((m) => m[1]));
    for (const id of ids) {
      assert.ok(['leftDriveAsDcMotor', 'rightDriveAsDcMotor', 'intakeMotorAsDcMotor', 'flywheelAsDcMotor',
        'crServoAsCRServo', 'pollenServoAsServo', 'gamepad1'].includes(id), id);
    }
  });

  it('sim-aanpassing: leftDrive REVERSE (linkermotor gespiegeld in de sim), verder het REV-origineel', () => {
    assert.match(blk, /dcMotor_setProperty_Direction[^]*?<field name="IDENTIFIER">leftDriveAsDcMotor<\/field>[^]*?REVERSE/);
    assert.ok(!/<field name="IDENTIFIER">rightDriveAsDcMotor<\/field>\s*<field name="PROP">Direction/.test(blk));
    assert.match(blk, /Sim-aanpassing/);
    for (const p of ['Triangle', 'Square', 'CrossWasPressed', 'CircleWasPressed', 'RightTriggerPressed', 'LeftBumper', 'RightBumper', 'DpadUp', 'DpadDown']) {
      assert.ok(blk.includes(`<field name="PROP">${p}</field>`), p);
    }
  });
});

describe('Sim-ondersteuning voor de REV TeleOp', () => {
  it('worker-gamepad: PlayStation-namen, TriggerPressed en WasPressed/WasReleased; beide workers identiek', () => {
    const w = fs.readFileSync(path.join(root, 'src/execution/opModeWorker.js'), 'utf8');
    assert.equal(w, fs.readFileSync(path.join(root, 'public/execution/opModeWorker.js'), 'utf8'));
    assert.match(w, /Cross: 'A', Circle: 'B', Square: 'X', Triangle: 'Y'/);
    assert.match(w, /TriggerPressed/);
    assert.match(w, /WasPressed`/);
  });

  it('flywheel: setVelocity → doel in ticks/s, vermogen × max; op snelheid binnen 5 %', () => {
    assert.equal(flywheelTarget({ velocityMode: true, velocityTicksPerSec: 1160 }), 1160);
    assert.equal(flywheelTarget({ power: 0.5 }), 0.5 * FLY_MAX_TICKS_PER_S);
    assert.equal(flywheelTarget(null), 0);
    assert.ok(flywheelAtSpeed(1150, 1160));
    assert.ok(!flywheelAtSpeed(900, 1160));
    assert.ok(!flywheelAtSpeed(-1160, -1160), 'achteruit voert niet in');
  });
});
