/**
 * Echte BIOBUZZ-scène (MuJoCo WASM):
 * - standaard = portret (90° gedraaid), lens 18,5 cm boven de mat, +22,5°: vanaf ±1,2 m tegelijk een
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

function world(mount, pollenAheadM = 0.9) {
  const model = mujoco.MjModel.mj_loadXML('/scene/biobuzz_scene.xml');
  const data = new mujoco.MjData(model);
  mujoco.mj_resetDataKeyframe(model, data, 0);
  if (mount) assert.equal(applyCameraMount(mujoco, model, data, mount), true);
  const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
  const q = (name) => model.jnt_qposadr[mujoco.mj_name2id(model, JNT, name)];
  // Robot op (1,2, −1,4), kijkt 125° (naar de BLUE SCORING-CELL, omhoog bij start).
  const yaw = (125 * Math.PI) / 180;
  const r = q('robot_free');
  data.qpos.set([1.2, -1.4, 0.059, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)], r);
  // Eén POLLEN op de vloer, recht voor het robotmidden.
  const p = q('pollen_fj_00');
  const a = pollenAheadM;
  data.qpos.set([1.2 + a * Math.cos(yaw), -1.4 + a * Math.sin(yaw), 0.0506, 1, 0, 0, 0], p);
  mujoco.mj_forward(model, data);
  return { model, data };
}

function detect(mount, pollenAheadM) {
  const { model, data } = world(mount, pollenAheadM);
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

  it('standaard uit simulation.json (portret, 18,5 cm, +22,5°): vloer-POLLEN én omhoog-CELL-tags in één beeld', () => {
    const mount = resolveCameraConfig(SIM_CAMERA).mount;
    assert.equal(mount.rollDeg, 90);
    const r = detect(mount, 1.1);
    assert.ok(Math.abs(r.camZ - 0.2) < 0.005, `lens op ±20 cm wereld-z (18,5 cm boven de mat): ${r.camZ}`);
    // Sensorframe draait mee: beeld-X (640 px) wijst omhoog (rechtop gezet beeld = 480×640).
    assert.ok(r.xmat[6] > 0.9, `beeld-X wijst omhoog: ${r.xmat}`);
    assert.equal(r.fov.viewWidth, 480);
    assert.equal(r.fov.viewHeight, 640);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'), JSON.stringify(r.tags.map((d) => d.metadata.name)));
    // POLLEN recht vooruit op de vloer: onderaan in de wereld = kleine X in het sensorbeeld, Y ≈ midden.
    const floorBlob = r.pollen.blobs.find((b) => b.Circle.X < 64 && Math.abs(b.Circle.Y - 240) < 3);
    assert.ok(floorBlob, `POLLEN onderin het (rechtop gezette) beeld: ${r.pollen.json}`);
  });

  it('zelfde montage liggend (zonder Portret): POLLEN recht vooruit valt onder het beeld', () => {
    const mount = { ...resolveCameraConfig(SIM_CAMERA).mount, rollDeg: 0 };
    const r = detect(mount, 1.1);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'));
    assert.equal(r.pollen.blobs.filter((b) => Math.abs(b.Circle.X - 320) < 3).length, 0, r.pollen.json);
  });
});
