/**
 * POLLEN-detectie gebruikt dezelfde camera als AprilTag (preset H×V, resolutie, rechthoekig
 * frustum) en de camerapositie/-kanteling is instelbaar via simulation.json → webcam.camera.mount.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CAMERA_MOUNT,
  DEFAULT_ROBOT_CAMERA_FOV,
  applyCameraMount,
  cameraFov,
  mountHeightAboveFloor,
  mountQuat,
  resolveCameraConfig,
  resolveCameraMount,
} from '../../src/mujoco/robotCamera.js';
import { computePollenColorBlobs } from '../../src/mujoco/simSensors.js';
import { createColorBlobLocatorAccess } from '../../src/ftc-runtime/colorBlobLocator.js';
import { opencvAccess } from '../../src/ftc-runtime/opencv.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const DEG = Math.PI / 180;
const near = (a, e, tol, msg) => assert.ok(Math.abs(a - e) <= tol, `${msg}: ${a} vs ${e} (±${tol})`);

/** Rotatiematrix (rij-major) uit MuJoCo-quaternion (w, x, y, z). */
function quatToMat([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
const col = (m, c) => [m[c], m[3 + c], m[6 + c]];

describe('Camera-montage (webcam.camera.mount)', () => {
  it('resolveCameraMount(null) → null; resolveCameraConfig vult altijd de standaardmontage aan', () => {
    assert.equal(resolveCameraMount(undefined), null);
    assert.deepEqual(resolveCameraConfig({}).mount, { ...DEFAULT_CAMERA_MOUNT });
    assert.deepEqual(resolveCameraConfig({ mount: { z: 0.04, pitchDeg: 26 } }).mount, {
      x: DEFAULT_CAMERA_MOUNT.x, y: 0, z: 0.04, pitchDeg: 26, rollDeg: 90,
    });
    assert.equal(resolveCameraConfig({ orientation: 'landscape', mount: { z: 0.04 } }).mount.rollDeg, 0);
  });

  it('ongeldige of extreme waarden: standaard resp. begrensd', () => {
    const m = resolveCameraMount({ x: 'abc', z: 5, pitchDeg: -200 });
    assert.equal(m.x, DEFAULT_CAMERA_MOUNT.x);
    assert.equal(m.z, 1.0);
    assert.equal(m.pitchDeg, -89);
  });

  it('mountQuat(39,73°) = de MJCF-pose (xyaxes "0 -1 0  -0.64 0 0.77")', () => {
    const m = quatToMat(mountQuat(39.73));
    const right = col(m, 0);
    const up = col(m, 1);
    const fwd = col(m, 2).map((v) => -v);
    const n = Math.hypot(0.64, 0.77);
    [0, -1, 0].forEach((v, i) => near(right[i], v, 1e-9, `rechts[${i}]`));
    [-0.64 / n, 0, 0.77 / n].forEach((v, i) => near(up[i], v, 1e-4, `boven[${i}]`));
    [0.77 / n, 0, 0.64 / n].forEach((v, i) => near(fwd[i], v, 1e-4, `vooruit[${i}]`));
  });

  it('mountQuat: 0° kijkt horizontaal vooruit, 26° omhoog, −20° omlaag', () => {
    for (const p of [0, 26, -20]) {
      const fwd = col(quatToMat(mountQuat(p)), 2).map((v) => -v);
      near(Math.atan2(fwd[2], fwd[0]) / DEG, p, 1e-9, `pitch ${p}`);
      near(fwd[1], 0, 1e-12, 'geen yaw');
    }
  });

  it('applyCameraMount schrijft site én camera en roept mj_forward aan', () => {
    let forwards = 0;
    const model = {
      site_pos: new Float64Array(6), site_quat: new Float64Array(8),
      cam_pos: new Float64Array(3), cam_quat: new Float64Array(4),
    };
    const mujoco = {
      mjtObj: { mjOBJ_SITE: { value: 6 }, mjOBJ_CAMERA: { value: 7 } },
      mj_name2id: (_m, t, n) => (n !== 'robot_up_cam' ? -1 : t === 6 ? 1 : 0),
      mj_forward: () => { forwards++; },
    };
    assert.equal(applyCameraMount(mujoco, model, {}, { x: 0.2, z: 0.03, pitchDeg: 26, rollDeg: 0 }), true);
    assert.deepEqual(Array.from(model.site_pos.slice(3)), [0.2, 0, 0.03]);
    assert.deepEqual(Array.from(model.cam_pos), [0.2, 0, 0.03]);
    assert.deepEqual(Array.from(model.site_quat.slice(4)), mountQuat(26));
    // Zonder rollDeg: standaardrol (portret, 90°).
    applyCameraMount(mujoco, model, {}, { x: 0.2, z: 0.03, pitchDeg: 26 });
    assert.deepEqual(Array.from(model.cam_quat), mountQuat(26, 90));
    assert.equal(forwards, 2);
    assert.equal(applyCameraMount(mujoco, model, {}, null), false);
  });

  it('beide simulation.json-kopieën: portret, mount = standaard (18,5 cm boven de mat, +22,5°, vóór de intake)', () => {
    for (const p of ['robots/BIOBUZZ/simulation.json', 'public/robots/BIOBUZZ/simulation.json']) {
      const cam = JSON.parse(read(p)).webcam.camera;
      assert.ok(cam.mount, `${p} heeft webcam.camera.mount`);
      assert.equal(cam.orientation, 'portrait');
      assert.deepEqual(resolveCameraMount(cam.mount), { ...DEFAULT_CAMERA_MOUNT });
      assert.deepEqual(resolveCameraConfig(cam).mount, { ...DEFAULT_CAMERA_MOUNT });
      assert.deepEqual(resolveCameraConfig(cam).resolution, { width: 640, height: 480 });
      assert.equal(resolveCameraConfig(cam).defaultDfovDeg, 90);
    }
    near(mountHeightAboveFloor(DEFAULT_CAMERA_MOUNT), 0.185, 0.002, 'lenshoogte boven de mat');
    assert.deepEqual(
      { x: DEFAULT_CAMERA_MOUNT.x, pitchDeg: DEFAULT_CAMERA_MOUNT.pitchDeg, rollDeg: DEFAULT_CAMERA_MOUNT.rollDeg },
      { x: 0.24, pitchDeg: 22.5, rollDeg: 90 },
    );
  });
});

/** Nep-wereld: camera in de oorsprong kijkt langs wereld +X (rechts = −Y, boven = +Z). */
function blobsFor(points, opts) {
  const CAM = [0, 0, -1, -1, 0, 0, 0, 1, 0];
  const names = points.map((_, i) => `pollen_${String(i).padStart(2, '0')}`);
  const mujoco = {
    mjtObj: { mjOBJ_SITE: { value: 1 }, mjOBJ_BODY: { value: 2 } },
    mj_name2id: (_m, t, n) => (t === 1 && n === 'robot_up_cam' ? 0 : -1),
    mj_id2name: (_m, _t, id) => names[id],
  };
  const data = {
    site_xpos: new Float64Array([0, 0, 0]),
    site_xmat: new Float64Array(CAM),
    xpos: new Float64Array(points.flat()),
  };
  return computePollenColorBlobs(mujoco, { nbody: points.length }, data, opts);
}
const fov = (d, res) => cameraFov(resolveCameraConfig(null), { dfovDeg: d, ...(res || {}) });
const at = (dist, hDeg, vDeg) => [dist, -dist * Math.tan(hDeg * DEG), dist * Math.tan(vDeg * DEG)];

describe('POLLEN-detectie = zelfde camera als AprilTag', () => {
  it('standaard (zonder opties) = Brio 4K 90° bij 640×480', () => {
    const r = blobsFor([at(1, 0, 0)]);
    assert.equal(r.width, 640);
    assert.equal(r.height, 480);
    near(r.blobs[0].Circle.X, 320, 1e-6, 'midden X');
    near(r.blobs[0].Circle.Y, 240, 1e-6, 'midden Y');
  });

  it('beeldrand ligt op ½V = 26,1° (oude 70°-kegel zag tot 35°)', () => {
    const f = fov(90);
    const edge = blobsFor([at(2, 0, 20)], { ...f }).blobs[0];
    const fy = 240 / Math.tan((f.vfovDeg / 2) * DEG);
    near(edge.Circle.Y, 240 - fy * Math.tan(20 * DEG), 1e-6, 'Y bij 20° omhoog');
    assert.equal(blobsFor([at(2, 0, 30)], { ...f }).blobs.length, 0, '30° omhoog valt buiten 52,2° V');
  });

  it('horizontaal 38°: buiten beeld bij 640×480 (½H 33,2°), binnen bij 1280×720 (½H 41,1°)', () => {
    const p = [at(1.5, 38, 0)];
    assert.equal(blobsFor(p, { ...fov(90) }).blobs.length, 0);
    const wide = blobsFor(p, { ...fov(90, { width: 1280, height: 720 }) });
    assert.equal(wide.blobs.length, 1);
    assert.equal(wide.width, 1280);
    assert.ok(wide.blobs[0].Circle.X > 640, 'rechts in beeld');
  });

  it('preset 65°: 25° rechts valt buiten (½H 22,6°), 90° ziet hem wel', () => {
    const p = [at(1.2, -25, 0)];
    assert.equal(blobsFor(p, { ...fov(65) }).blobs.length, 0);
    assert.equal(blobsFor(p, { ...fov(90) }).blobs.length, 1);
  });

  it('straal in pixels volgt de brandpuntsafstand (kleiner zichtveld = grotere blob)', () => {
    const r90 = blobsFor([at(1, 0, 0)], { ...fov(90) }).blobs[0].Circle.Radius;
    const r65 = blobsFor([at(1, 0, 0)], { ...fov(65) }).blobs[0].Circle.Radius;
    const f90 = 240 / Math.tan((fov(90).vfovDeg / 2) * DEG);
    near(r90, f90 * 0.03556, 1e-6, 'straal 90°');
    assert.ok(r65 > r90 * 1.4, `65°: ${r65} > 1,4 × ${r90}`);
  });

  it('adapters geven preset + resolutie door, geen vaste 70°/640×480 meer', () => {
    for (const p of ['src/mujoco/adapters.js', 'src/mujoco/BiobuzzHardwareAdapter.js']) {
      const src = read(p);
      assert.match(src, /computePollenColorBlobs\([^)]*\{[^}]*hfovDeg: this\.cameraFov\.hfovDeg[^}]*width: this\.cameraFov\.width/s, p);
    }
    const sim = read('src/mujoco/simSensors.js');
    const fn = sim.slice(sim.indexOf('export function computePollenColorBlobs'), sim.indexOf('export function quatToYawPitchRoll'));
    assert.doesNotMatch(fn, /fovyDeg = 70|width = 640|height = 480/);
    assert.equal(DEFAULT_ROBOT_CAMERA_FOV.width, 640);
  });
});

describe('ColorBlobLocator ROI in unity-coördinaten volgt de resolutie', () => {
  const blobs = [
    { ContourArea: 100, Density: 1, Circle: { X: 900, Y: 200, Radius: 6, Center: { x: 900, y: 200 } } },
    { ContourArea: 100, Density: 1, Circle: { X: 300, Y: 200, Radius: 6, Center: { x: 300, y: 200 } } },
  ];
  const run = (snap) => {
    const access = createColorBlobLocatorAccess(() => snap);
    const b = access.createColorBlobLocatorProcessorBuilder();
    access.setRoi(b, opencvAccess.asUnityCenterCoordinates(0, 1, 1, -1)); // rechterhelft
    return JSON.parse(access.getBlobs(access.buildColorBlobLocatorProcessor(b))).map((x) => x.Circle.X);
  };
  it('1280×720: rechterhelft = x ≥ 640', () => {
    assert.deepEqual(run({ json: JSON.stringify(blobs), width: 1280, height: 720 }), [900]);
  });
  it('zonder resolutie: 640×480 zoals voorheen', () => {
    assert.deepEqual(run({ json: JSON.stringify(blobs) }), []);
  });
  it('worker gebruikt dezelfde omrekening (beide kopieën identiek)', () => {
    const a = read('src/execution/opModeWorker.js');
    assert.equal(a, read('public/execution/opModeWorker.js'));
    assert.match(a, /hw \* \(roi\.left \+ 1\)/);
  });
});
