import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blk = fs.readFileSync(path.join(root, 'examples/StarterBot_ImuHiveAuto.blk'), 'utf8');
const xml = blk.slice(0, blk.indexOf('</xml>'));

/** Waarde van het math_number-blok dat direct aan variabele `name` wordt toegekend. */
function constant(name) {
  const re = new RegExp(`<field name="VAR" id="v_${name}">${name}</field>\\s*<value name="VALUE">\\s*<block type="math_number"[^>]*>\\s*<field name="NUM">([-\\d.]+)</field>`);
  const m = xml.match(re);
  assert.ok(m, `constante ${name} ontbreekt`);
  return Number(m[1]);
}

describe('StarterBot_ImuHiveAuto.blk (autonoom: IMU + AprilTag naar de HIVE + schieten)', () => {
  it('is an AUTONOMOUS OpMode listed in the dropdown', () => {
    assert.match(blk, /flavor="AUTONOMOUS"/);
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /value="StarterBot_ImuHiveAuto\.blk"/);
  });

  it('defines every procedure it calls', () => {
    const defs = new Set([...xml.matchAll(/type="procedures_defnoreturn"[^>]*>(?:\s*<mutation>[\s\S]*?<\/mutation>)?\s*<field name="NAME">(\w+)</g)].map((m) => m[1]));
    for (const p of ['runOpMode', 'readHeading', 'computeError', 'turnToHeading', 'driveStraight', 'localize', 'goToShootingSpot', 'shootAll']) {
      assert.ok(defs.has(p), p);
    }
    for (const m of xml.matchAll(/<mutation name="(\w+)"/g)) assert.ok(defs.has(m[1]), `call to undefined ${m[1]}`);
  });

  it('declares every variable it uses', () => {
    const declared = new Set([...xml.matchAll(/<variable id="([^"]+)">/g)].map((m) => m[1]));
    for (const m of xml.matchAll(/<field name="VAR" id="([^"]+)">/g)) assert.ok(declared.has(m[1]), m[1]);
    for (const m of xml.matchAll(/<arg name="\w+" varid="([^"]+)"/g)) assert.ok(declared.has(m[1]), m[1]);
  });

  it('uses IMU heading (degrees) for driving and turning, with timeouts', () => {
    assert.match(xml, /imuAsIMU/);
    assert.match(xml, /imu_resetYaw/);
    assert.match(xml, /yawPitchRollAngles_getPropertyWithAngleUnit_Number[\s\S]*?DEGREES/);
    assert.match(xml, /linearOpMode_getRuntime_Number/);
    assert.match(xml, /RUN_USING_ENCODER/);
  });

  it('localizes on the RED AUDIENCE cluster (red upward CELL) with horizontal (portrait + pitch) geometry', () => {
    assert.match(xml, /isClusterDetection/);
    assert.match(xml, /<field name="TEXT">RED AUDIENCE<\/field>/);
    for (const p of ['ftcPose.x', 'ftcPose.y', 'ftcPose.z']) assert.ok(xml.includes(`<field name="PROP">${p}</field>`), p);
    // SDK-range/bearing zijn bij een portretcamera niet horizontaal: het programma gebruikt ze niet.
    assert.ok(!xml.includes('ftcPose.range') && !xml.includes('ftcPose.bearing'));
  });

  it('constants match the camera mount and the shooting-distance study', () => {
    const sim = JSON.parse(fs.readFileSync(path.join(root, 'public/robots/BIOBUZZ/simulation.json'), 'utf8'));
    const mount = sim.webcam?.camera?.mount;
    assert.ok(mount, 'webcam.camera.mount');
    assert.equal(constant('CAMERA_PITCH_DEG'), Number(mount.pitchDeg));
    assert.equal(constant('CAMERA_FORWARD_M'), Number(mount.x));
    const r = constant('SHOOT_DISTANCE_M');
    assert.ok(r >= 1.06 && r <= 1.54, `SHOOT_DISTANCE_M ${r}`);
    assert.equal(constant('HIVE_HEADING'), 0);
    // RED AUDIENCE-cluster = opening van de rode omhoog-CELL (na het terugspiegelen van het veld, y < 0).
    assert.equal(constant('TAG_X'), -0.324);
    assert.equal(constant('TAG_Y'), -0.416);
  });

  it('the horizontal range/bearing formula undoes the camera pitch (portrait frame)', () => {
    // Doel 1,0 m vóór de lens, 0,2 m links, 0,8 m hoger; camera 17,5° omhoog, 90° gerold (portret).
    const P = (17.5 * Math.PI) / 180;
    const h = 1.0, left = 0.2, v = 0.8;
    const ftc = { y: h * Math.cos(P) + v * Math.sin(P), x: v * Math.cos(P) - h * Math.sin(P), z: left };
    const forwardH = ftc.y * Math.cos(P) - ftc.x * Math.sin(P);
    assert.ok(Math.abs(forwardH - h) < 1e-9);
    assert.ok(Math.abs(Math.hypot(forwardH, ftc.z) - Math.hypot(h, left)) < 1e-9);
    assert.ok(Math.abs(Math.atan2(ftc.z, forwardH) - Math.atan2(left, h)) < 1e-9);
  });

  it('shoots up to 4 elements (G407) with flywheel power edges', () => {
    assert.match(xml, /<field name="IDENTIFIER">flywheelAsDcMotor<\/field>\s*<field name="PROP">Power<\/field>/);
    assert.match(xml, /<field name="VAR" id="v_shots">shots<\/field>[\s\S]*?<field name="NUM">4<\/field>/);
    const sim = JSON.parse(fs.readFileSync(path.join(root, 'public/robots/BIOBUZZ/simulation.json'), 'utf8'));
    assert.ok(JSON.stringify(sim).includes('flywheelAsDcMotor'));
  });

  it('after the TIP: collects yellow POLLEN with the colour-blob processor and shoots at RED SCORING', () => {
    const defs = [...xml.matchAll(/<field name="NAME">(\w+)<\/field>/g)].map((m) => m[1]);
    assert.ok(defs.includes('collectYellow'));
    assert.match(xml, /<field name="CONSTANT">YELLOW<\/field>/);
    assert.match(xml, /colorBlobLocatorProcessor_getBlobs/);
    assert.match(xml, /visionPortalBuilder_addProcessor[\s\S]*visionPortalBuilder_addProcessor/);
    assert.match(xml, /intakeMotorAsDcMotor/);
    for (const name of ['RED AUDIENCE', 'RED SCORING']) assert.ok(xml.includes(`<field name="TEXT">${name}</field>`), name);
    assert.equal((xml.match(/<mutation name="shootAll"/g) || []).length, 3); // ronde 1, ronde 2 en shootRound (lus);
    assert.equal((xml.match(/<mutation name="goToShootingSpot"/g) || []).length, 3);
    assert.equal(constant('TAG_Y') < 0, true); // eerste toekenning: RED AUDIENCE (omhoog vóór de TIP)
  });

  it('loops: collect yellow POLLEN and shoot again into the current upward CELL until time runs out', () => {
    const defs = new Set([...xml.matchAll(/type="procedures_defnoreturn"[^>]*>(?:\s*<mutation>[\s\S]*?<\/mutation>)?\s*<field name="NAME">(\w+)</g)].map((m) => m[1]));
    for (const p of ['scanForYellow', 'collectOdo', 'localizeAny', 'setTargetCell', 'shootRound', 'goTo', 'driveOdo']) assert.ok(defs.has(p), p);
    assert.equal(constant('TOTAL_TIME_S'), 120);
    // Beide rode clusters herkennen: welke omhoog staat volgt uit de gemeten hoogte (HIVE kan opnieuw kantelen).
    assert.match(xml, /<field name="TEXT">RED SCORING<\/field>/);
    assert.match(xml, /<field name="VAR" id="v_upCell">upCell<\/field>/);
    assert.match(xml, /<field name="VAR" id="v_tagZ">tagZ<\/field>/);
  });
});

