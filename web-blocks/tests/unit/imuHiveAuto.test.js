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

/** XML van procedure-definitie `name` (tot de volgende procedure-definitie). */
function procBody(name) {
  const start = xml.indexOf(`<field name="NAME">${name}</field>`);
  assert.ok(start >= 0, `procedure ${name} ontbreekt`);
  const next = xml.indexOf('type="procedures_defnoreturn"', start);
  return xml.slice(start, next < 0 ? xml.length : next);
}

describe('StarterBot_ImuHiveAuto.blk (autonoom: IMU + AprilTag naar de HIVE + schieten)', () => {
  it('is an AUTONOMOUS OpMode listed in the dropdown', () => {
    assert.match(blk, /flavor="AUTONOMOUS"/);
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /value="StarterBot_ImuHiveAuto\.blk"/);
  });

  it('sets a ColorBlobLocator contour mode before build (robot throws otherwise)', () => {
    const iMode = xml.indexOf('colorBlobLocatorProcessorBuilder_setContourMode');
    const iBuild = xml.indexOf('colorBlobLocatorProcessorBuilder_build');
    assert.ok(iMode > 0 && iMode < iBuild);
    assert.match(xml, /<field name="CONTOUR_MODE">EXTERNAL_ONLY<\/field>/);
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

  it('localizes on the RED AUDIENCE cluster (red upward CELL) with horizontal (landscape + pitch) geometry', () => {
    assert.match(xml, /isClusterDetection/);
    assert.match(xml, /<field name="TEXT">RED AUDIENCE<\/field>/);
    for (const p of ['ftcPose.x', 'ftcPose.y', 'ftcPose.z']) assert.ok(xml.includes(`<field name="PROP">${p}</field>`), p);
    // Liggend: omhoog = ftcPose.z, links = -ftcPose.x (geen portret-omzetting meer).
    assert.match(xml, /v_up">up<\/field>\s*<value name="VALUE">\s*<block type="aprilTagDetection2_getProperty_Number"[^>]*>\s*<field name="PROP">ftcPose.z</);
    assert.match(xml, /v_side">side<\/field>\s*<value name="VALUE">\s*<block type="math_single"[^>]*>\s*<field name="OP">NEG<\/field>\s*<value name="NUM">\s*<block type="aprilTagDetection2_getProperty_Number"[^>]*>\s*<field name="PROP">ftcPose.x</);
    assert.ok(!/v_up">up<\/field>\s*<value name="VALUE">\s*<block[^>]*>\s*<field name="PROP">ftcPose.x</.test(xml), 'geen portret-mapping');
    // De lokalisatie-pose gebruikt geen ruwe range/bearing (alleen liggende geometrie).
    for (const p of ['localize', 'localizeAny']) {
      const body = procBody(p);
      assert.ok(!body.includes('ftcPose.range') && !body.includes('ftcPose.bearing'), `${p} gebruikt geen ruwe range/bearing`);
    }
    assert.ok(!xml.includes('ftcPose.range'));
  });

  it('aims on the AprilTag bearing (aimAprilBearing) before shooting', () => {
    const aim = procBody('aimAprilBearing');
    assert.ok(aim.includes('<field name="PROP">ftcPose.bearing</field>'), 'aimAprilBearing stuurt op ftcPose.bearing');
    assert.match(xml, /<block type="procedures_callnoreturn"[^>]*>\s*<mutation name="aimAprilBearing"/, 'aimAprilBearing wordt aangeroepen vóór het schieten');
    // bearing komt alleen in aimAprilBearing voor.
    assert.equal(xml.split('ftcPose.bearing').length - 1, aim.split('ftcPose.bearing').length - 1);
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

  it('the horizontal range/bearing formula undoes the camera pitch (landscape frame)', () => {
    // Doel 1,0 m vóór de lens, 0,2 m links, 0,8 m hoger; camera 35° omhoog, liggend.
    const P = (35 * Math.PI) / 180;
    const h = 1.0, left = 0.2, v = 0.8;
    const ftc = { y: h * Math.cos(P) + v * Math.sin(P), z: v * Math.cos(P) - h * Math.sin(P), x: -left };
    const up = ftc.z, side = -ftc.x;
    const forwardH = ftc.y * Math.cos(P) - up * Math.sin(P);
    assert.ok(Math.abs(forwardH - h) < 1e-9);
    assert.ok(Math.abs(side - left) < 1e-9);
    assert.ok(Math.abs(ftc.y * Math.sin(P) + up * Math.cos(P) - v) < 1e-9, 'hoogte boven de lens');
  });

  it('shoots up to 4 elements (G407) with flywheel power edges', () => {
    assert.match(xml, /<field name="IDENTIFIER">flywheelAsDcMotor<\/field>\s*<field name="PROP">Power<\/field>/);
    assert.match(xml, /<field name="VAR" id="v_shots">shots<\/field>[\s\S]*?<field name="NUM">4<\/field>/);
    const sim = JSON.parse(fs.readFileSync(path.join(root, 'public/robots/BIOBUZZ/simulation.json'), 'utf8'));
    assert.ok(JSON.stringify(sim).includes('flywheelAsDcMotor'));
  });

  it('yellow POLLEN via the REAR camera (Webcam 2 + ColorBlob), AprilTags on Webcam 1, known spots as fallback', () => {
    // Twee portals: Webcam 1 = AprilTag, Webcam 2 = gele ColorBlob.
    assert.equal((xml.match(/visionPortalBuilder_addProcessor/g) || []).length, 2);
    assert.match(xml, /<field name="WEBCAM_NAME">Webcam 1<\/field>[\s\S]*?myAprilTagProcessor/);
    assert.match(xml, /<field name="WEBCAM_NAME">Webcam 2<\/field>[\s\S]*?myRearBlobProcessor/);
    assert.match(xml, /<field name="CONSTANT">YELLOW<\/field>/);
    const r = xml.indexOf('<field name="NAME">rearCollect</field>');
    assert.ok(r > 0, 'rearCollect');
    const rc = xml.slice(r, xml.indexOf('type="procedures_defnoreturn"', r));
    assert.match(rc, /colorBlobLocatorProcessor_getBlobs[\s\S]*?myRearBlobProcessor/);
    assert.ok(!rc.includes('myAprilTagProcessor'), 'achtercamera alleen voor geel');
    // Stuurt achteruit op beeld-X (bal links achter = X > 320 → linkerwiel minder achteruit).
    assert.match(rc, /<field name="NUM">-0.25<\/field>[\s\S]*?steer/);
    assert.match(rc, /v_fallbackM">fallbackM<\/field>\s*<value name="VALUE">\s*<block type="math_number"[^>]*>\s*<field name="NUM">0</);
    for (const gone of ['collectYellow', 'scanForYellow', 'collectOdo']) assert.ok(!xml.includes(`<field name="NAME">${gone}</field>`), gone);
    assert.match(xml, /intakeMotorAsDcMotor/);
    const i = xml.indexOf('<field name="NAME">collectAt</field>');
    assert.ok(i > 0, 'collectAt');
    const c = xml.slice(i, xml.indexOf('type="procedures_defnoreturn"', i));
    // Eerst de achtercamera, dan (zonder geel: fallbackM = backM) achteruit naar de bekende plek.
    assert.match(c, /<mutation name="rearCollect">[\s\S]*?<mutation name="driveOdo">[\s\S]*?v_fallbackM[\s\S]*?<field name="NUM">-0.25<\/field>/);
    assert.equal((xml.match(/<mutation name="collectAt"/g) || []).length, 3);
    for (const name of ['RED AUDIENCE', 'RED SCORING']) assert.ok(xml.includes(`<field name="TEXT">${name}</field>`), name);
    assert.equal((xml.match(/<mutation name="shootAll"/g) || []).length, 2); // preload + shootRound (lus)
    assert.equal(constant('TAG_Y') < 0, true); // eerste toekenning: RED AUDIENCE (omhoog vóór de TIP)
  });

  it('loops: collect at the next known spot and shoot again into the current upward CELL until spots or time run out', () => {
    const defs = new Set([...xml.matchAll(/type="procedures_defnoreturn"[^>]*>(?:\s*<mutation>[\s\S]*?<\/mutation>)?\s*<field name="NAME">(\w+)</g)].map((m) => m[1]));
    for (const p of ['collectAt', 'leaveHive', 'localizeAny', 'setTargetCell', 'shootRound', 'goTo', 'driveOdo']) assert.ok(defs.has(p), p);
    assert.equal(constant('TOTAL_TIME_S'), 120);
    assert.match(xml, /<field name="VAR" id="v_spot">spot<\/field>/);
    assert.match(xml, /<field name="VAR" id="v_upCell">upCell<\/field>/);
    assert.match(xml, /<field name="VAR" id="v_tagZ">tagZ<\/field>/);
  });

  it('shoots from the tip line: same x as the CELL, facing the opening along y (SHOOT_HEADING +90 / -90)', () => {
    const i = xml.indexOf('<field name="NAME">goToShootingSpot</field>');
    const g = xml.slice(i, xml.indexOf('type="procedures_defnoreturn"', i));
    assert.ok(g.includes('>SHOOT_HEADING</field>'));
    assert.match(g, /<field name="NUM">90<\/field>/);
    assert.match(g, /<field name="NUM">-90<\/field>/);
    assert.ok(g.includes('<mutation name="goTo"'), 'odometrie naar de schietplek');
  });

  it('keeps clear of the HIVE posts (x = -0.6): routes via the x = -1.0 corridor and y = ±1.2', () => {
    const i = xml.indexOf('<field name="NAME">leaveHive</field>');
    const l = xml.slice(i, xml.indexOf('type="procedures_defnoreturn"', i));
    assert.match(l, /<field name="NUM">-1<\/field>|<field name="NUM">-1.0<\/field>/);
    assert.match(l, /<field name="NUM">1.2<\/field>/);
    const g = xml.slice(xml.indexOf('<field name="NAME">goToShootingSpot</field>'));
    assert.ok(g.slice(0, g.indexOf('type="procedures_defnoreturn"')).includes('<mutation name="leaveHive"'));
  });

  it('decides the upward CELL robustly (both clusters, several frames, re-check at the spot) and never shoots when unsure', () => {
    const def = (name) => {
      const i = xml.indexOf(`<field name="NAME">${name}</field>`);
      assert.ok(i > 0, name);
      const j = xml.indexOf('type="procedures_defnoreturn"', i);
      return xml.slice(i, j < 0 ? undefined : j);
    };
    const d = def('decideUpCell');
    for (const v of ['zAud', 'zSco', 'nAud', 'nSco', 'cellSure', 'frame']) assert.ok(d.includes(`>${v}</field>`), v);
    const r = def('shootRound');
    assert.ok((r.match(/<mutation name="decideUpCell"/g) || []).length >= 2, 'schietplek (+ na wisselen)');
    const iShoot = r.indexOf('<mutation name="shootAll"');
    assert.ok(iShoot > 0 && r.lastIndexOf('>cellSure</field>', iShoot) > 0, 'shootAll alleen na cellSure');
  });
  it('assumes the start pose / HIVE stand and only checks right before shooting (no mid-route localize)', () => {
    const def = (name) => {
      const i = xml.indexOf(`<field name="NAME">${name}</field>`);
      const j = xml.indexOf('type="procedures_defnoreturn"', i);
      return xml.slice(i, j < 0 ? undefined : j);
    };
    assert.ok(!xml.includes('<mutation name="localizeAny"/>'), 'geen localizeAny-tussenstop');
    const r = def('shootRound');
    assert.ok(!/<field name="NUM">-1.45<\/field>/.test(r), 'geen midden-stop in shootRound');
    const iGo = r.indexOf('<mutation name="goToShootingSpot"');
    assert.ok(iGo > 0 && r.indexOf('<mutation name="decideUpCell"') > iGo, 'CELL pas op de schietplek controleren');
    const g = def('goToShootingSpot');
    const iLeave = g.indexOf('<mutation name="leaveHive"');
    assert.ok(!g.slice(0, iLeave).includes('<mutation name="localize"'), 'geen startcontrole vooraf');
    assert.ok(g.slice(iLeave).includes('<mutation name="localize"'), 'localize op de schietplek, vóór het schieten');
    assert.ok(!/<mutation name="localize(Any)?"/.test(def('collectAt')), 'na het schieten is de positie bekend');
  });
  it('only fires the shooter when the last localize saw the HIVE tags (found), otherwise skips the shot', () => {
    const i = xml.indexOf('<field name="NAME">shootAll</field>');
    const j = xml.indexOf('type="procedures_defnoreturn"', i);
    const s = xml.slice(i, j < 0 ? undefined : j);
    const iIf = s.indexOf('<block type="controls_if"');
    const iFound = s.indexOf('<field name="VAR" id="v_found">found</field>', iIf);
    const iFly = s.indexOf('flywheelAsDcMotor');
    const iElse = s.indexOf('<statement name="ELSE">');
    assert.ok(iIf > 0 && iFound > iIf, 'if found');
    assert.ok(iFly > iFound && iFly < iElse, 'flywheel alleen in de DO-tak');
    assert.ok(!s.slice(iElse).includes('flywheelAsDcMotor'), 'niet schieten zonder tags');
    assert.match(s.slice(iElse), /niet schieten/);
    // goToShootingSpot eindigt met localize, en alleen localize zet found.
    const g = xml.slice(xml.indexOf('<field name="NAME">goToShootingSpot</field>'));
    assert.ok(g.slice(0, g.indexOf('type="procedures_defnoreturn"')).includes('<mutation name="localize"'));
  });

  it('keeps time since START: startT after waitForStart, shown in telemetry, used for the time limit', () => {
    assert.match(xml, /linearOpMode_waitForStart[\s\S]*?v_startT">startT<\/field>\s*<value name="VALUE">\s*<block type="linearOpMode_getRuntime_Number"/);
    const i = xml.indexOf('<field name="NAME">showTime</field>');
    assert.ok(i > 0, 'showTime');
    assert.ok(xml.slice(i).includes('<field name="TEXT">Tijd sinds start (s)</field>'));
    // Elke telemetry.update na START krijgt de tijd erbij.
    const updates = (xml.match(/type="telemetry_update"/g) || []).length;
    const shows = (xml.match(/<mutation name="showTime"\s*\/?>/g) || []).length;
    assert.equal(shows, updates - 1, `${shows} showTime / ${updates} updates (alleen niet vóór START)`);
    assert.match(xml, /<field name="OP">MINUS<\/field>\s*<value name="A">\s*<block type="linearOpMode_getRuntime_Number"[^>]*\/>\s*<\/value>\s*<value name="B">\s*<block type="variables_get"[^>]*>\s*<field name="VAR" id="v_startT">/);
  });
});
