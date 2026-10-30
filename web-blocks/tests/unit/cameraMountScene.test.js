/**
 * Echte BIOBUZZ-scène (MuJoCo WASM):
 * - standaard (simulation.json) = liggend aan de voorkant, 16,5 cm, +35°: HIVE-tags vanaf de schietplekken en vanuit het midden;
 *   POLLEN op de vloer en de tags van de omhoog-CELL; liggend op dezelfde plek niet;
 * - lage liggende montage (6,5 cm, +22,5°) kan het ook; de oude MJCF-pose (32 cm, +39,7°) alleen de tags.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import {
  LEGACY_CAMERA_MOUNT,
  applyCameraMount,
  cameraFov,
  resolveCameraConfig,
} from '../../src/mujoco/robotCamera.js';
import { computeAprilTagDetections, computePollenColorBlobs } from '../../src/mujoco/simSensors.js';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const RECOMMENDED = { x: 0.24, y: 0, z: 0.021, pitchDeg: 22.5, rollDeg: 0 };
const SIM_CAMERA = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../robots/BIOBUZZ/simulation.json'), 'utf8'),
).webcam.camera;

let mujoco;
before(async () => {
  mujoco = await loadMujoco();
  mujoco.FS.mkdir('/scene');
  for (const d of ['meshes', 'textures']) {
    mujoco.FS.mkdir(`/scene/${d}`);
    for (const f of fs.readdirSync(path.join(assets, d))) {
      mujoco.FS.writeFile(`/scene/${d}/${f}`, new Uint8Array(fs.readFileSync(path.join(assets, d, f))));
    }
  }
  mujoco.FS.writeFile('/scene/biobuzz_scene.xml', fs.readFileSync(path.join(assets, 'biobuzz_scene.xml'), 'utf8'));
});

// Robot op (1,2, +1,4) (blauwe helft, achterzijde), kijkt −125° (naar de BLUE SCORING-CELL, omhoog bij start).
const BLUE_POSE = { x: 1.2, y: 1.4, yawDeg: -125 };
// Puntgespiegeld (180° om het veldmidden): rode helft, publiekszijde, kijkt naar de RED AUDIENCE-CELL.
const RED_POSE = { x: -1.2, y: -1.4, yawDeg: 55 };

function world(mount, pollenAheadM = 0.9, pose = BLUE_POSE) {
  const model = mujoco.MjModel.mj_loadXML('/scene/biobuzz_scene.xml');
  const data = new mujoco.MjData(model);
  mujoco.mj_resetDataKeyframe(model, data, 0);
  if (mount) assert.equal(applyCameraMount(mujoco, model, data, mount), true);
  const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
  const q = (name) => model.jnt_qposadr[mujoco.mj_name2id(model, JNT, name)];
  const yaw = (pose.yawDeg * Math.PI) / 180;
  const r = q('robot_free');
  data.qpos.set([pose.x, pose.y, 0.059, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)], r);
  // Eén POLLEN op de vloer, recht voor het robotmidden.
  const p = q('pollen_fj_00');
  const a = pollenAheadM;
  data.qpos.set([pose.x + a * Math.cos(yaw), pose.y + a * Math.sin(yaw), 0.0506, 1, 0, 0, 0], p);
  mujoco.mj_forward(model, data);
  return { model, data };
}

function detect(mount, pollenAheadM, pose) {
  const { model, data } = world(mount, pollenAheadM, pose);
  const fov = cameraFov(resolveCameraConfig(null), { dfovDeg: 90, rollDeg: mount?.rollDeg ?? 0 });
  const opts = { cameraSiteName: 'robot_up_cam', hfovDeg: fov.hfovDeg, vfovDeg: fov.vfovDeg };
  const tags = computeAprilTagDetections(mujoco, model, data, { ...opts, maxRangeM: 2.5, minFacingDot: 0.55 }).detections;
  const pollen = computePollenColorBlobs(mujoco, model, data, { ...opts, width: fov.width, height: fov.height });
  const SITE = mujoco.mjtObj.mjOBJ_SITE.value;
  const sid = mujoco.mj_name2id(model, SITE, 'robot_up_cam');
  return { tags, pollen, fov, camZ: data.site_xpos[sid * 3 + 2], xmat: Array.from(data.site_xmat.slice(sid * 9, sid * 9 + 9)) };
}

describe('Camera-montage in de echte scène', () => {
  it('aanbevolen lage montage: POLLEN op de vloer én omhoog-CELL-tags in één beeld', () => {
    const r = detect(RECOMMENDED);
    assert.ok(Math.abs(r.camZ - 0.08) < 0.005, `lens op ±8 cm wereld-z (6,5 cm boven de mat): ${r.camZ}`);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'), JSON.stringify(r.tags.map((d) => d.metadata.name)));
    const floorBlob = r.pollen.blobs.find((b) => b.Circle.Y > 240);
    assert.ok(floorBlob, `POLLEN onderin het beeld: ${r.pollen.json}`);
  });

  it('oude MJCF-pose (32 cm, +39,7°, liggend): tags wel, vloer-POLLEN niet', () => {
    const r = detect(null);
    assert.ok(Math.abs(r.camZ - 0.339) < 0.005, `oude lenshoogte: ${r.camZ}`);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'));
    assert.equal(r.pollen.blobs.length, 0);
    const legacy = detect(LEGACY_CAMERA_MOUNT);
    assert.ok(Math.abs(legacy.camZ - 0.339) < 0.005, 'LEGACY_CAMERA_MOUNT = MJCF-pose');
  });

  it('standaard uit simulation.json (liggend aan de voorkant, 16,5 cm, +35°): HIVE-tags vanaf de schietplekken en vanuit het midden', () => {
    const mount = resolveCameraConfig(SIM_CAMERA).mount;
    assert.equal(mount.rollDeg, 0);
    assert.equal(mount.pitchDeg, 35);
    const names = (pose, tipDeg) => {
      const { model, data } = world(mount, 3, pose);
      const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
      data.qpos[model.jnt_qposadr[mujoco.mj_name2id(model, JNT, 'hive_red_tip')]] = (tipDeg * Math.PI) / 180;
      mujoco.mj_forward(model, data);
      const fov = cameraFov(resolveCameraConfig(null), { dfovDeg: 90, rollDeg: 0 });
      const opts = { cameraSiteName: 'robot_up_cam', hfovDeg: fov.hfovDeg, vfovDeg: fov.vfovDeg, maxRangeM: 2.5, minFacingDot: 0.55 };
      return computeAprilTagDetections(mujoco, model, data, opts).detections.filter((d) => d.isClusterDetection).map((d) => d.metadata.name);
    };
    // Schietplekken in het verlengde van de wip (1,1 m voor de omhoog-CELL, voorkant naar de opening).
    assert.ok(names({ x: -0.324, y: -1.516, yawDeg: 90 }, 0).includes('RED AUDIENCE'));
    assert.ok(names({ x: -0.324, y: 1.53, yawDeg: -90 }, 60).includes('RED SCORING'));
    // Midden-controle (-1,45, 0) richting HIVE: beide rode clusters, in beide standen van de HIVE.
    for (const tip of [0, 60]) {
      const n = names({ x: -1.45, y: 0, yawDeg: 0 }, tip);
      assert.ok(n.includes('RED AUDIENCE') && n.includes('RED SCORING'), `tip ${tip}: ${n}`);
    }
  });

  it('zelfde montage liggend (zonder Portret): nabije POLLEN (±0,75 m) valt onder het beeld (portret wel)', () => {
    // Liggend V≈52°: pollen pas vanaf ±0,85 m vóór de lens; portret V≈66° al vanaf ±0,46 m.
    const mount = { ...resolveCameraConfig(SIM_CAMERA).mount, rollDeg: 0 };
    const r = detect(mount, 0.75);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'));
    assert.equal(
      r.pollen.blobs.filter((b) => Math.abs(b.Circle.X - 320) < 5).length,
      0,
      r.pollen.json,
    );
  });

  it('omhoog-CELLs (Guide §11.1): RED AUDIENCE vanaf de rode publiekskant en BLUE SCORING vanaf blauw achter, beide rechtop (|roll| < 90°)', () => {
    // Liggende camera: roll is in het camerabeeld; een portretcamera draait die 90° mee.
    const mount = { ...resolveCameraConfig(SIM_CAMERA).mount, rollDeg: 0 };
    for (const [pose, name] of [[RED_POSE, 'RED AUDIENCE'], [BLUE_POSE, 'BLUE SCORING']]) {
      const r = detect(mount, 1.1, pose);
      const det = r.tags.find((d) => d.metadata.name === name);
      assert.ok(det, `${name} in beeld: ${JSON.stringify(r.tags.map((d) => d.metadata.name))}`);
      assert.ok(Math.abs(det.ftcPose.roll) < 90, `${name} roll ${det.ftcPose.roll.toFixed(1)}° (omhoog = scorebaar)`);
      for (const d of r.tags.filter((t) => /RED SCORING|BLUE AUDIENCE/.test(t.metadata.name))) {
        assert.ok(Math.abs(d.ftcPose.roll) > 90, `${d.metadata.name} hangt omlaag: roll ${d.ftcPose.roll.toFixed(1)}°`);
      }
    }
  });
});
