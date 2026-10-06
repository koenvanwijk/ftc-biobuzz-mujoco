/**
 * Echte BIOBUZZ-scène (MuJoCo WASM): met de aanbevolen lage montage (lens ±6,5 cm boven de mat,
 * +22,5°) ziet dezelfde camera vanaf ±1,2 m tegelijk een POLLEN op de vloer en de tags van de
 * omhoog-CELL; met de standaardmontage (32 cm, +39,7°) alleen de tags.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { applyCameraMount, cameraFov, resolveCameraConfig } from '../../src/mujoco/robotCamera.js';
import { computeAprilTagDetections, computePollenColorBlobs } from '../../src/mujoco/simSensors.js';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const RECOMMENDED = { x: 0.24, y: 0, z: 0.021, pitchDeg: 22.5 };

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

function world(mount) {
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
  // Eén POLLEN op de vloer, 0,9 m voor het robotmidden.
  const p = q('pollen_fj_00');
  data.qpos.set([1.2 + 0.9 * Math.cos(yaw), -1.4 + 0.9 * Math.sin(yaw), 0.0506, 1, 0, 0, 0], p);
  mujoco.mj_forward(model, data);
  return { model, data };
}

function detect(mount) {
  const { model, data } = world(mount);
  const fov = cameraFov(resolveCameraConfig(null), { dfovDeg: 90 });
  const opts = { cameraSiteName: 'robot_up_cam', hfovDeg: fov.hfovDeg, vfovDeg: fov.vfovDeg };
  const tags = computeAprilTagDetections(mujoco, model, data, { ...opts, maxRangeM: 2.5, minFacingDot: 0.55 }).detections;
  const pollen = computePollenColorBlobs(mujoco, model, data, { ...opts, width: fov.width, height: fov.height });
  const SITE = mujoco.mjtObj.mjOBJ_SITE.value;
  const sid = mujoco.mj_name2id(model, SITE, 'robot_up_cam');
  return { tags, pollen, camZ: data.site_xpos[sid * 3 + 2] };
}

describe('Camera-montage in de echte scène', () => {
  it('aanbevolen lage montage: POLLEN op de vloer én omhoog-CELL-tags in één beeld', () => {
    const r = detect(RECOMMENDED);
    assert.ok(Math.abs(r.camZ - 0.08) < 0.005, `lens op ±8 cm wereld-z (6,5 cm boven de mat): ${r.camZ}`);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'), JSON.stringify(r.tags.map((d) => d.metadata.name)));
    const floorBlob = r.pollen.blobs.find((b) => b.Circle.Y > 240);
    assert.ok(floorBlob, `POLLEN onderin het beeld: ${r.pollen.json}`);
  });

  it('standaardmontage (32 cm, +39,7°): tags wel, vloer-POLLEN niet', () => {
    const r = detect(null);
    assert.ok(Math.abs(r.camZ - 0.339) < 0.005, `standaard lenshoogte: ${r.camZ}`);
    assert.ok(r.tags.some((d) => d.metadata.name === 'BLUE SCORING'));
    assert.equal(r.pollen.blobs.length, 0);
  });
});
