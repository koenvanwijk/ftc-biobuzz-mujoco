/**
 * DcMotor.isBusy(): end-to-end through the real OpMode worker (JS-Interpreter) + a physics-free
 * BIOBUZZ adapter host loop (commands → wheel slew → encoder ticks → 'clock' sensors).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BiobuzzHardwareAdapter } from '../../src/mujoco/BiobuzzHardwareAdapter.js';
import { DcMotorBridge, wrapDcMotor } from '../../src/ftc-runtime/dcMotor.js';
import {
  LEFT_DRIVE_SIGN,
  RIGHT_DRIVE_SIGN,
  updateDriveSlew,
  resetDriveState,
} from '../../src/worlds/biobuzz/mechanisms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TICKS_PER_RAD = (28 * 20) / (2 * Math.PI); // simulation.json: 28 ticks/rev × 20:1

/** Load public/execution/opModeWorker.js in a worker-like sandbox. */
function loadWorker() {
  const messages = [];
  const workerUrl = pathToFileURL(path.join(root, 'public/execution/opModeWorker.js')).href;
  const sandbox = {
    URL,
    console,
    location: { href: workerUrl },
    postMessage: (m) => messages.push(m),
  };
  sandbox.self = sandbox;
  sandbox.importScripts = (...urls) => {
    for (const u of urls) {
      const f = fileURLToPath(u);
      vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(fileURLToPath(workerUrl), 'utf8'), ctx, { filename: 'opModeWorker.js' });
  const send = (m) => sandbox.onmessage({ data: m });
  send({
    type: 'loadInterpreter',
    acornUrl: pathToFileURL(path.join(root, 'public/vendor/js-interpreter/acorn.js')).href,
    interpreterUrl: pathToFileURL(path.join(root, 'public/vendor/js-interpreter/interpreter.js')).href,
  });
  assert.ok(messages.some((m) => m.type === 'ready'), JSON.stringify(messages));
  return { messages, send };
}

/** BIOBUZZ adapter without MuJoCo: wheel joint qpos integrates the slewed wheel rad/s (ctrl). */
function makeAdapter() {
  const a = Object.create(BiobuzzHardwareAdapter.prototype);
  const meta = (side, i) => ({
    kind: 'drive', side, ticksPerRad: TICKS_PER_RAD, maxRadPerSec: 31, qposAdr: i, qvelAdr: i,
    invert: false, polaritySign: side === 'left' ? LEFT_DRIVE_SIGN : RIGHT_DRIVE_SIGN,
    dirSign: 1, target: 0, tol: 10, mode: 'RUN_WITHOUT_ENCODER', encoderOffset: 0,
  });
  a._motorMeta = { leftDriveAsDcMotor: meta('left', 0), rightDriveAsDcMotor: meta('right', 1) };
  a.data = { ctrl: new Float64Array(2), qpos: new Float64Array(2), qvel: new Float64Array(2) };
  a.mech = { setIntakePower() {}, fire() {}, tryPlaceNectar() {} };
  a._flyArmed = false;
  a._placeArmed = false;
  return a;
}

/**
 * Run `code` like main.js does: init → (frames) → start → frames until done.
 * Returns the telemetry key/value pairs in order + final encoder ticks.
 */
function runOpMode(code, { maxSec = 15, debug, defaults } = {}) {
  resetDriveState();
  const adapter = makeAdapter();
  const { messages, send } = loadWorker();
  let t = 0;
  let latest = {};
  let seen = 0;
  const dt = 0.002;
  const drain = () => {
    for (; seen < messages.length; seen++) {
      const m = messages[seen];
      if (m.type === 'commands') {
        latest = m.commands;
        adapter.applyCommands(latest);
      }
      if (m.type === 'error') throw new Error(m.message);
    }
  };
  const sensors = () => ({
    leftDriveAsDcMotor: adapter._motorSensor('leftDriveAsDcMotor'),
    rightDriveAsDcMotor: adapter._motorSensor('rightDriveAsDcMotor'),
  });
  const frame = () => {
    adapter.applyCommands(latest);
    for (let i = 0; i < 8; i++) { // ~60 fps × 2 ms substeps
      updateDriveSlew(adapter.data, dt);
      for (let j = 0; j < 2; j++) {
        adapter.data.qvel[j] = adapter.data.ctrl[j];
        adapter.data.qpos[j] += adapter.data.ctrl[j] * dt;
      }
      t += dt;
    }
    send({ type: 'clock', timeSec: t, sensors: sensors(), gamepads: { g1: {}, g2: {} } });
    drain();
  };
  send({
    type: 'init',
    code,
    sensors: sensors(),
    supplyVoltage: 12.5,
    motorDefaultDirections: defaults || { leftDriveAsDcMotor: 'REVERSE', rightDriveAsDcMotor: 'FORWARD' },
    debug: debug || { enabled: false },
  });
  drain();
  for (let i = 0; i < 5; i++) frame();
  send({ type: 'start' });
  drain();
  const done = () => messages.some((m) => m.type === 'done');
  while (!done() && t < maxSec) frame();
  const tel = messages.filter((m) => m.type === 'telemetryAdd').map((m) => [m.key, m.value]);
  return { tel, done: done(), t, adapter, sensors: sensors() };
}

const values = (tel, key) => tel.filter(([k]) => k === key).map(([, v]) => v);

/** Typical user program: target → RUN_TO_POSITION → power → while (active && isBusy). */
function program(motor, target = 1000, { power = 0.5, dir } = {}) {
  return `
function runOpMode() {
  ${dir ? `${motor}.setDirection("${dir}");` : ''}
  ${motor}.setMode("STOP_AND_RESET_ENCODER");
  linearOpMode.waitForStart();
  ${motor}.setTargetPosition(${target});
  ${motor}.setMode("RUN_TO_POSITION");
  ${motor}.setPower(${power});
  telemetry.addData("first", ${motor}.isBusy());
  while (linearOpMode.opModeIsActive() && ${motor}.isBusy()) {
    telemetry.addData("busy", ${motor}.isBusy());
    telemetry.addData("pos", ${motor}.getCurrentPosition());
    telemetry.update();
  }
  telemetry.addData("after", ${motor}.isBusy());
  telemetry.addData("end", ${motor}.getCurrentPosition());
  ${motor}.setPower(0);
}
`;
}

describe('DcMotor.isBusy in the OpMode worker (RUN_TO_POSITION)', () => {
  for (const [motor, dir] of [
    ['leftDriveAsDcMotor', undefined], // default REVERSE (mirrored left motor)
    ['rightDriveAsDcMotor', undefined], // default FORWARD
    ['leftDriveAsDcMotor', 'FORWARD'],
    ['rightDriveAsDcMotor', 'REVERSE'],
  ]) {
    for (const target of [1000, -600]) {
      it(`${motor}${dir ? ` (${dir})` : ''} target ${target}: busy right after setPower, false at target, loop ends`, () => {
        const r = runOpMode(program(motor, target, { dir }));
        assert.ok(r.done, `OpMode not finished after ${r.t.toFixed(1)}s`);
        assert.deepEqual(values(r.tel, 'first'), [true], 'isBusy() directly after setPower must be true');
        const busy = values(r.tel, 'busy');
        assert.ok(busy.length > 10, `loop body ran ${busy.length}×`);
        // (the last body may read false: the budget can yield between the while-check and the body)
        assert.ok(busy.slice(0, -1).every((b) => b === true), JSON.stringify(busy));
        assert.deepEqual(values(r.tel, 'after'), [false]);
        const end = values(r.tel, 'end')[0];
        assert.ok(Math.abs(end - target) <= 10, `end position ${end} vs target ${target}`);
      });
    }
  }

  it('is false when power is 0, in other run modes, and when already at target', () => {
    const r = runOpMode(`
function runOpMode() {
  var m = leftDriveAsDcMotor;
  m.setMode("STOP_AND_RESET_ENCODER");
  linearOpMode.waitForStart();
  m.setTargetPosition(500);
  m.setMode("RUN_TO_POSITION");
  telemetry.addData("zeroPower", m.isBusy());
  m.setPower(0.4);
  telemetry.addData("rtp", m.isBusy());
  m.setMode("RUN_USING_ENCODER");
  telemetry.addData("rue", m.isBusy());
  m.setPower(0);
  m.setTargetPosition(m.getCurrentPosition() + 5);
  m.setMode("RUN_TO_POSITION");
  m.setPower(0.4);
  telemetry.addData("withinTol", m.isBusy());
  m.setPower(0);
}
`);
    assert.ok(r.done);
    assert.deepEqual(values(r.tel, 'zeroPower'), [false]);
    assert.deepEqual(values(r.tel, 'rtp'), [true]);
    assert.deepEqual(values(r.tel, 'rue'), [false]);
    assert.deepEqual(values(r.tel, 'withinTol'), [false]);
  });

  it('EncoderAuto-pattern (setDual*, both motors, idle in loop) drives both wheels to 1000 and ends', () => {
    const r = runOpMode(`
function runOpMode() {
  leftDriveAsDcMotor.setDualMode("STOP_AND_RESET_ENCODER", rightDriveAsDcMotor, "STOP_AND_RESET_ENCODER");
  linearOpMode.waitForStart();
  leftDriveAsDcMotor.setDualTargetPosition(1000, rightDriveAsDcMotor, 1000);
  leftDriveAsDcMotor.setDualMode("RUN_TO_POSITION", rightDriveAsDcMotor, "RUN_TO_POSITION");
  leftDriveAsDcMotor.setDualPower(0.4, rightDriveAsDcMotor, 0.4);
  telemetry.addData("first", leftDriveAsDcMotor.isBusy() && rightDriveAsDcMotor.isBusy());
  while (linearOpMode.opModeIsActive() && (leftDriveAsDcMotor.isBusy() || rightDriveAsDcMotor.isBusy())) {
    linearOpMode.idle();
    telemetry.addData("busy", leftDriveAsDcMotor.isBusy() || rightDriveAsDcMotor.isBusy());
    telemetry.update();
  }
  telemetry.addData("L", leftDriveAsDcMotor.getCurrentPosition());
  telemetry.addData("R", rightDriveAsDcMotor.getCurrentPosition());
  leftDriveAsDcMotor.setDualPower(0, rightDriveAsDcMotor, 0);
}
`);
    assert.ok(r.done);
    assert.deepEqual(values(r.tel, 'first'), [true]);
    assert.ok(values(r.tel, 'busy').length > 10);
    for (const k of ['L', 'R']) {
      const v = values(r.tel, k)[0];
      assert.ok(Math.abs(v - 1000) <= 10, `${k}=${v}`);
    }
    // forward: both logical wheels moved forward (left mirrored → electrical ticks negative)
    assert.ok(r.adapter.data.qpos[0] > 0 && r.adapter.data.qpos[1] > 0);
  });

  it('works with the debugger enabled (run mode, highlightBlock calls)', () => {
    const code = program('rightDriveAsDcMotor', 800).replace(/;\n/g, ';\nhighlightBlock("b");\n');
    const r = runOpMode(code, { debug: { enabled: true, startPaused: false } });
    assert.ok(r.done);
    assert.deepEqual(values(r.tel, 'first'), [true]);
    assert.ok(values(r.tel, 'busy').length > 10);
    assert.deepEqual(values(r.tel, 'after'), [false]);
  });
});

describe('RUN_TO_POSITION power limit + adapter busy', () => {
  it('|power| caps the RUN_TO_POSITION speed', () => {
    const fast = runOpMode(program('rightDriveAsDcMotor', 1500, { power: 1 }));
    const slow = runOpMode(program('rightDriveAsDcMotor', 1500, { power: 0.25 }));
    assert.ok(fast.done && slow.done);
    assert.ok(slow.t > fast.t * 1.3, `slow ${slow.t.toFixed(2)}s vs fast ${fast.t.toFixed(2)}s`);
  });

  it('adapter sensor busy needs nonzero power', () => {
    const a = makeAdapter();
    const cmd = (power) => ({
      type: 'motor', jsId: 'rightDriveAsDcMotor', power, direction: 'FORWARD', mode: 'RUN_TO_POSITION',
      targetPosition: 500, targetTolerance: 10, encoderOffsetTicks: 0, enabled: true,
    });
    a.applyCommands({ rightDriveAsDcMotor: cmd(0) });
    assert.equal(a._motorSensor('rightDriveAsDcMotor').busy, false);
    assert.equal(a._motorPower01(cmd(0), a._motorMeta.rightDriveAsDcMotor), 0);
    a.applyCommands({ rightDriveAsDcMotor: cmd(0.5) });
    assert.equal(a._motorSensor('rightDriveAsDcMotor').busy, true);
  });
});

describe('DcMotorBridge.isBusy (main-thread runtime)', () => {
  it('true right after setPower in RUN_TO_POSITION, follows the encoder afterwards', () => {
    let sensor = { positionTicks: 0, velocityTicksPerSec: 0, busy: false }; // stale host busy
    const m = wrapDcMotor(new DcMotorBridge('rightDriveAsDcMotor', {
      publishCommand: () => {}, readSensor: () => sensor, limits: { maxRadPerSec: 10, ticksPerRad: 50 },
    }));
    m.setTargetPosition(400);
    m.setMode('RUN_TO_POSITION');
    assert.equal(m.isBusy(), false); // no power yet
    m.setPower(0.5);
    assert.equal(m.isBusy(), true);
    sensor = { positionTicks: 395, velocityTicksPerSec: 0, busy: false };
    assert.equal(m.isBusy(), false);
    m.setMode('RUN_USING_ENCODER');
    sensor = { positionTicks: 0, velocityTicksPerSec: 0, busy: true };
    assert.equal(m.isBusy(), false);
  });
});
