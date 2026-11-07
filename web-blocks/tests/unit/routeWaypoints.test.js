import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { waypointSegments, routeToBlocksXml, normDeg } from '../../src/ui/routeWaypoints.js';
import { parseFieldElements, worldToFtc, ftcToWorld, worldYawToFtcDeg } from '../../src/ui/fieldElements.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

describe('waypointSegments', () => {
  it('heading, draaihoek en afstand per segment', () => {
    const s = waypointSegments([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }], 0);
    assert.equal(s.length, 3);
    near(s[0].heading, 0); near(s[0].turn, 0); near(s[0].distance, 1);
    near(s[1].heading, 90); near(s[1].turn, 90);
    near(s[2].heading, -135); near(s[2].turn, 135); near(s[2].distance, Math.SQRT2);
  });
  it('IMU-heading relatief aan start-yaw', () => {
    const s = waypointSegments([{ x: 0, y: 0 }, { x: 0, y: 1 }], 90);
    near(s[0].heading, 0); near(s[0].turn, 0);
    const t = waypointSegments([{ x: 0, y: 0 }, { x: -1, y: 0 }], 0);
    near(t[0].heading, 180);
  });
  it('slaat nul-segmenten over; normDeg', () => {
    assert.equal(waypointSegments([{ x: 0, y: 0 }, { x: 0, y: 0 }]).length, 0);
    assert.equal(normDeg(270), -90); assert.equal(normDeg(-180), 180);
  });
});

describe('routeToBlocksXml', () => {
  it('functie gevolgdeRoute met turnToHeading + driveStraight per segment', () => {
    const segs = waypointSegments([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }], 0);
    const xml = routeToBlocksXml(segs, { power: 0.4 });
    assert.match(xml, /type="procedures_defnoreturn"[^>]*><field name="NAME">gevolgdeRoute</);
    assert.equal((xml.match(/mutation name="turnToHeading"/g) || []).length, 2);
    assert.equal((xml.match(/mutation name="driveStraight"/g) || []).length, 2);
    assert.match(xml, /driveStraight"><arg name="meters"\/><arg name="targetHeading"\/><arg name="maxPower"\/><\/mutation><value name="ARG0"><block type="math_number"[^>]*><field name="NUM">0.5</);
    assert.match(xml, /<field name="NUM">90<\/field>/);
    assert.equal((xml.match(/<block /g) || []).length, (xml.match(/<\/block>/g) || []).length);
    assert.ok(typeof DOMParser === 'undefined' || new DOMParser().parseFromString(xml, 'text/xml'));
  });
  it('helpers bestaan in ImuHiveAuto met deze argumenten', () => {
    const blk = fs.readFileSync(new URL('../../examples/StarterBot_ImuHiveAuto.blk', import.meta.url), 'utf8');
    assert.match(blk, /<arg name="targetHeading" varid="[^"]+"\/>\s*<\/mutation>\s*<field name="NAME">turnToHeading</);
    assert.match(blk, /<arg name="meters"[^>]*\/>\s*<arg name="targetHeading"[^>]*\/>\s*<arg name="maxPower"[^>]*\/>\s*<\/mutation>\s*<field name="NAME">driveStraight</);
  });
});

describe('fieldElements', () => {
  const xml = fs.readFileSync(new URL('../../public/assets/biobuzz_scene.xml', import.meta.url), 'utf8');
  const fe = parseFieldElements(xml);
  it('leest 4 FLOWERs, 4 HIVE-paalvoeten en 2 starts uit de scene', () => {
    assert.equal(fe.flowers.length, 4);
    assert.equal(fe.posts.length, 4);
    for (const p of fe.posts) { near(Math.abs(p.x), 0.6); near(Math.abs(p.y), 0.46); }
    const red = fe.starts.find((s) => s.alliance === 'red');
    near(red.x, -1.5688); near(red.y, 1.4764);
    const blue = fe.starts.find((s) => s.alliance === 'blue');
    near(blue.x, 1.5688); near(blue.yawDeg, 180);
  });
  it('HIVE-paalvoeten gekleurd naar dichtstbijzijnde HIVE (rood x<0, blauw x>0)', () => {
    for (const p of fe.posts) assert.equal(p.alliance, p.x < 0 ? 'red' : 'blue');
  });
  it('geen veldelementen-legenda meer in de plot', () => {
    const src = fs.readFileSync(new URL('../../src/ui/routePlot.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /start rood|HIVE-paal'/);
  });
  it('FTC-afbeelding: rood op -Y_ftc, publiek op +X_ftc, round-trip', () => {
    const r = worldToFtc(-1.5, 0); near(r.y, -1.5);
    const aud = worldToFtc(0, -1.8); near(aud.x, 1.8);
    const w = ftcToWorld(...Object.values(worldToFtc(0.3, -0.7))); near(w.x, 0.3); near(w.y, -0.7);
    assert.equal(worldYawToFtcDeg(0), 90); assert.equal(worldYawToFtcDeg(180), -90);
  });
});

describe('3D-startcamera komt overeen met 2D-plot', () => {
  it('camera bij de rode muur (-X), scherm-rechts = -Y sim (= +X_ftc)', () => {
    const src = fs.readFileSync(new URL('../../src/worlds/biobuzz/renderer.js', import.meta.url), 'utf8');
    const pos = src.match(/DEFAULT_CAMERA_POS = \[([^\]]+)\]/)[1].split(',').map(Number);
    const tgt = src.match(/DEFAULT_CAMERA_TARGET = \[([^\]]+)\]/)[1].split(',').map(Number);
    const f = [tgt[0] - pos[0], tgt[1] - pos[1]];
    const right = [f[1], -f[0]]; // f x z (up = +Z)
    assert.ok(pos[0] < 0 && Math.abs(pos[1]) < 1e-9);
    assert.ok(right[1] < 0 && Math.abs(right[0]) < 1e-9);
  });
});

import { snapAxisAligned } from '../../src/ui/routeWaypoints.js';
describe('snapAxisAligned (Shift)', () => {
  it('houdt grootste component, nult de andere', () => {
    assert.deepEqual(snapAxisAligned({ x: 0, y: 0 }, { x: 1, y: 0.2 }), { x: 1, y: 0 });
    assert.deepEqual(snapAxisAligned({ x: 0.5, y: 0.5 }, { x: 0.4, y: -1 }), { x: 0.5, y: -1 });
    assert.deepEqual(snapAxisAligned(null, { x: 1, y: 2 }), { x: 1, y: 2 });
  });
  it('gesnapte route geeft rechte hoeken (start-yaw veld-gericht)', () => {
    const a = { x: -1.5, y: 1.4 };
    const b = snapAxisAligned(a, { x: -0.3, y: 1.3 });
    const c = snapAxisAligned(b, { x: -0.25, y: 0.2 });
    const segs = waypointSegments([a, b, c], 0);
    assert.deepEqual(segs.map((s) => Math.round(s.heading)), [0, -90]);
    const back = waypointSegments([c, b], 0);
    assert.equal(Math.round(back[0].heading), 90);
    assert.equal(Math.round(waypointSegments([b, a], 0)[0].heading), 180);
  });
});

describe('Java-preview-paneel weg', () => {
  it('index.html en main.js hebben geen javaOut meer; Export Java blijft', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const js = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /javaOut|Java \(preview\)/);
    assert.doesNotMatch(js, /javaOut/);
    assert.match(html, /id="btnExportJava"/);
  });
});
