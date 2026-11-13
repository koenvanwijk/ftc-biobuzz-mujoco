import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../../scripts/strategies/js2blk.mjs';
import { buildStrategy, STRATEGIES } from '../../scripts/strategies/build.mjs';
import { blkToJs } from '../helpers/blkToJs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const xmlOf = (blk) => blk.slice(0, blk.indexOf('</xml>'));

describe('js2blk (strategy source → FTC Blocks)', () => {
  it('compiles procedures, return values, if/else-if/else, while, for-of and intrinsics', () => {
    const blk = compile(`
      function runOpMode() { initDrive(); waitForStart(); x = twice(3); if (x > 5) { drive(0.5, 0.5); } else if (x < 0) { sleep(10); } else { x += 1; }
        while (active() && x < 10) { x = x + 1; } for (const d of detections()) { y = pose(d, 'ftcPose.bearing'); } setPower('flywheel', 1); }
      function twice(a) { b = a * 2; return b; }`);
    const xml = xmlOf(blk);
    assert.match(xml, /type="procedures_defreturn"[^>]*><mutation><arg name="a" varid="v_a"\/><\/mutation><field name="NAME">twice</);
    assert.match(xml, /<mutation elseif="1" else="1"\/>/);
    assert.match(xml, /controls_whileUntil/);
    assert.match(xml, /<block type="controls_forEach"><field name="VAR" id="v_d">d<\/field>/);
    assert.match(xml, /<field name="PROP">ftcPose.bearing<\/field>/);
    assert.match(blk, /flavor="AUTONOMOUS"/);
    const js = blkToJs(path.join(root, 'examples', STRATEGIES.hive)); // generator loads fine
    assert.match(js, /function runOpMode\(\)/);
  });

  it('rejects unsupported syntax instead of silently dropping it', () => {
    assert.throws(() => compile('function runOpMode() { x = [1, 2]; }'), /expression ArrayExpression/);
    assert.throws(() => compile('function runOpMode() { nope(); }'), /unknown statement call nope/);
  });
});

describe('BIOBUZZ strategy examples', () => {
  const html = read('index.html');
  for (const [name, file] of Object.entries(STRATEGIES)) {
    describe(file, () => {
      const blk = read(`examples/${file}`);
      const xml = xmlOf(blk);

      it('is an AUTONOMOUS OpMode in the dropdown, identical in examples/ and public/examples/', () => {
        assert.match(blk, /flavor="AUTONOMOUS"/);
        assert.match(html, new RegExp(`value="${file.replace('.', '\\.')}"`));
        assert.equal(read(`public/examples/${file}`), blk);
      });

      it('is up to date with scripts/strategies (node scripts/strategies/build.mjs)', () => {
        assert.equal(buildStrategy(name), blk);
      });

      it('defines every procedure it calls and declares every variable', () => {
        const defs = new Set([...xml.matchAll(/type="procedures_def(?:no)?return"[^>]*>(?:<mutation>[\s\S]*?<\/mutation>)?<field name="NAME">(\w+)</g)].map((m) => m[1]));
        assert.ok(defs.has('runOpMode'));
        for (const m of xml.matchAll(/<mutation name="(\w+)"/g)) assert.ok(defs.has(m[1]), `call to undefined ${m[1]}`);
        const declared = new Set([...xml.matchAll(/<variable id="([^"]+)"/g)].map((m) => m[1]));
        for (const m of xml.matchAll(/<field name="VAR" id="([^"]+)">/g)) assert.ok(declared.has(m[1]), m[1]);
      });

      it('real robot polarity: right drive REVERSE, BRAKE, IMU yaw in degrees, encoders', () => {
        const js = blkToJs(file);
        assert.match(js, /leftDriveAsDcMotor\.setDirection\("FORWARD"\)/);
        assert.match(js, /rightDriveAsDcMotor\.setDirection\("REVERSE"\)/);
        assert.match(js, /setDualZeroPowerBehavior\("BRAKE"/);
        assert.match(js, /getYaw\(imuAsIMU\.getRobotYawPitchRollAngles\(\), "DEGREES"\)/);
        assert.match(js, /RUN_USING_ENCODER/);
        assert.match(js, /intakeMotorAsDcMotor\.setPower\(1\)/);
        assert.match(js, /flywheelAsDcMotor\.setPower\(1\)/);
        assert.match(js, /function park\(\)/);
      });

      it('camera constants match the robot camera mount', () => {
        const sim = JSON.parse(read('public/robots/BIOBUZZ/simulation.json'));
        const mount = sim.webcam.camera.mount;
        const js = blkToJs(file);
        assert.match(js, new RegExp(`CAMERA_PITCH_DEG = ${mount.pitchDeg};`));
        assert.match(js, new RegExp(`CAMERA_FORWARD_M = ${mount.x};`));
      });
    });
  }

  it('HIVE and HYBRID start with exactly 3 preload POLLEN into the RED AUDIENCE CELL (3 NECTAR are already in it: TIP)', () => {
    for (const f of [STRATEGIES.hive, STRATEGIES.hybrid]) {
      const js = blkToJs(f);
      const body = js.slice(js.indexOf('waitForStart'));
      assert.match(body, /^[^]*?\n {2}(scoreInHive\(\d\)|collect\(|shoot\()/, f);
      assert.equal(body.match(/\n {2}(scoreInHive\(\d\)|collect\(|shoot\()/)[0].trim(), 'scoreInHive(3)', f);
    }
  });

  it('never holds more than 4 elements: collect only after shooting (G407)', () => {
    for (const f of Object.values(STRATEGIES)) {
      const js = blkToJs(f);
      const run = js.slice(js.indexOf('function runOpMode'), js.indexOf('\n}\n', js.indexOf('function runOpMode')));
      const calls = [...run.matchAll(/\b(scoreInHive|shoot|collect)\(/g)].map((m) => m[1]);
      assert.notEqual(calls[0], 'collect', `${f}: starts with 4 preloads, must shoot before collecting`);
      for (let i = 1; i < calls.length; i++) assert.ok(!(calls[i] === 'collect' && calls[i - 1] === 'collect'), `${f}: two collects in a row`);
    }
  });
});
