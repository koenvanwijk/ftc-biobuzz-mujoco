import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DcMotorBridge, wrapDcMotor } from '../../src/ftc-runtime/dcMotor.js';
import { createRuntime } from '../../src/ftc-runtime/createRuntime.js';
import {
  LEFT_DRIVE_SIGN,
  RIGHT_DRIVE_SIGN,
  electricalToWheelSticks,
  setTankPower,
  updateDriveSlew,
  resetDriveState,
} from '../../src/worlds/biobuzz/mechanisms.js';
import { BiobuzzHardwareAdapter } from '../../src/mujoco/BiobuzzHardwareAdapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readCfg = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

function makeMotor(jsId, cmds) {
  return wrapDcMotor(
    new DcMotorBridge(jsId, {
      publishCommand: (c) => cmds.push(c),
      readSensor: () => ({ positionTicks: 0, velocityTicksPerSec: 0, busy: false }),
      limits: { maxRadPerSec: 10, ticksPerRad: 50 },
    }),
  );
}

/** Adapter without MuJoCo: only what applyCommands needs. */
function makeAdapter() {
  const a = Object.create(BiobuzzHardwareAdapter.prototype);
  const meta = (side) => ({
    kind: 'drive', side, ticksPerRad: 1, maxRadPerSec: 1, qposAdr: -1, qvelAdr: -1,
    invert: false, polaritySign: side === 'left' ? LEFT_DRIVE_SIGN : RIGHT_DRIVE_SIGN,
    dirSign: 1, target: 0, tol: 10, mode: 'RUN_WITHOUT_ENCODER', encoderOffset: 0,
  });
  a._motorMeta = { leftDriveAsDcMotor: meta('left'), rightDriveAsDcMotor: meta('right') };
  a.data = { ctrl: new Float64Array(2), qpos: new Float64Array(2), qvel: new Float64Array(2) };
  a.mech = { setIntakePower() {}, fire() {}, tryPlaceNectar() {} };
  a._thr = undefined;
  a._flyArmed = false;
  a._placeArmed = false;
  return a;
}

/** Physics-free: drive commands → slewed wheel targets (rad/s, + = forward). */
function wheelSpeeds(adapter, cmds) {
  resetDriveState();
  adapter.applyCommands(cmds);
  for (let i = 0; i < 200; i++) updateDriveSlew(adapter.data, 0.01);
  return [adapter.data.ctrl[0], adapter.data.ctrl[1]];
}

describe('drive polarity constants', () => {
  it('inverts the LEFT drive, not the right', () => {
    assert.equal(LEFT_DRIVE_SIGN, -1);
    assert.equal(RIGHT_DRIVE_SIGN, 1);
    assert.deepEqual(electricalToWheelSticks(-0.5, 0.5), { left: 0.5, right: 0.5 });
  });
});

describe('real-robot polarity: left REVERSE + right FORWARD', () => {
  it('positive power on both motors => both wheel sticks positive-forward', () => {
    const cmds = [];
    const left = makeMotor('leftDriveAsDcMotor', cmds);
    const right = makeMotor('rightDriveAsDcMotor', cmds);
    left.setDirection('REVERSE');
    right.setDirection('FORWARD');
    left.setPower(0.5);
    right.setPower(0.5);
    const last = (id) => cmds.filter((c) => c.jsId === id).at(-1);
    assert.equal(last('leftDriveAsDcMotor').power, -0.5); // electrical
    assert.equal(last('rightDriveAsDcMotor').power, 0.5);
    const s = electricalToWheelSticks(last('leftDriveAsDcMotor').power, last('rightDriveAsDcMotor').power);
    assert.equal(s.left, 0.5);
    assert.equal(s.right, 0.5);
  });

  it('adapter.applyCommands drives both wheel targets forward', () => {
    const cmds = [];
    const left = makeMotor('leftDriveAsDcMotor', cmds);
    const right = makeMotor('rightDriveAsDcMotor', cmds);
    left.setDirection('REVERSE');
    right.setDirection('FORWARD');
    left.setPower(0.5);
    right.setPower(0.5);
    const byId = {};
    for (const c of cmds) byId[c.jsId] = c;
    const [wl, wr] = wheelSpeeds(makeAdapter(), byId);
    assert.ok(wl > 0, `left wheel ${wl}`);
    assert.ok(wr > 0, `right wheel ${wr}`);
    assert.ok(Math.abs(wl - wr) < 1e-9);
  });

  it('setDirection block overrides the hardware-map default', () => {
    const cmds = [];
    const left = makeMotor('leftDriveAsDcMotor', cmds);
    left.setDirection('REVERSE'); // default
    left.setDirection('FORWARD'); // Blocks override
    left.setPower(0.5);
    assert.equal(cmds.at(-1).power, 0.5);
  });

  it('RUN_TO_POSITION with REVERSE left drives the wheel forward and reports busy in the logical frame', () => {
    const a = makeAdapter();
    const cmd = (dir, id) => ({
      type: 'motor', jsId: id, power: 0.4 * (dir === 'REVERSE' ? -1 : 1), direction: dir,
      mode: 'RUN_TO_POSITION', targetPosition: 1000, targetTolerance: 10, encoderOffsetTicks: 0,
    });
    const [wl, wr] = wheelSpeeds(a, {
      leftDriveAsDcMotor: cmd('REVERSE', 'leftDriveAsDcMotor'),
      rightDriveAsDcMotor: cmd('FORWARD', 'rightDriveAsDcMotor'),
    });
    assert.ok(wl > 0 && wr > 0, `${wl} ${wr}`);
  });

  it('teleop (setTankPower with logical sticks) is not inverted', () => {
    resetDriveState();
    const data = { ctrl: new Float64Array(2) };
    setTankPower(data, 0.5, 0.5);
    for (let i = 0; i < 200; i++) updateDriveSlew(data, 0.01);
    assert.ok(data.ctrl[0] > 0 && data.ctrl[1] > 0);
  });
});

describe('hardware-map defaults', () => {
  for (const rel of ['public/robots/BIOBUZZ/simulation.json', 'robots/BIOBUZZ/simulation.json']) {
    it(`${rel}: left REVERSE, right FORWARD`, () => {
      const cfg = readCfg(rel);
      assert.equal(cfg.drive.left.defaultDirection, 'REVERSE');
      assert.equal(cfg.drive.right.defaultDirection, 'FORWARD');
    });
  }

  it('both simulation.json copies are identical', () => {
    assert.deepEqual(
      readCfg('public/robots/BIOBUZZ/simulation.json'),
      readCfg('robots/BIOBUZZ/simulation.json'),
    );
  });

  it('createRuntime applies defaults; no setDirection => both wheels forward with +power', () => {
    const rt = createRuntime(readCfg('robots/BIOBUZZ/simulation.json'));
    assert.equal(rt.motors.leftDriveAsDcMotor.getDirection(), 'REVERSE');
    assert.equal(rt.motors.rightDriveAsDcMotor.getDirection(), 'FORWARD');
    rt.motors.leftDriveAsDcMotor.setPower(0.5);
    rt.motors.rightDriveAsDcMotor.setPower(0.5);
    const c = rt.bus.allCommands();
    const s = electricalToWheelSticks(c.leftDriveAsDcMotor.power, c.rightDriveAsDcMotor.power);
    assert.deepEqual(s, { left: 0.5, right: 0.5 });
  });

  it('createRuntime: setDirection overrides default', () => {
    const rt = createRuntime(readCfg('robots/BIOBUZZ/simulation.json'));
    rt.motors.leftDriveAsDcMotor.setDirection('FORWARD');
    assert.equal(rt.motors.leftDriveAsDcMotor.getDirection(), 'FORWARD');
  });

  it('TankDrive example sets leftDrive REVERSE / rightDrive FORWARD', () => {
    const blk = fs.readFileSync(path.join(root, 'examples/StarterBot_TankDrive.blk'), 'utf8');
    const m = [...blk.matchAll(/id="d([LR])"><field name="DIRECTION">(\w+)</g)];
    const d = Object.fromEntries(m.map((x) => [x[1], x[2]]));
    assert.deepEqual(d, { L: 'REVERSE', R: 'FORWARD' });
  });
});
