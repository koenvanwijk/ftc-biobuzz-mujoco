/**
 * Tweede robotcamera ACHTER (Webcam 2, `robot_rear_cam`): kijkt achteruit en schuin omlaag naar de vloer
 * voor gele POLLEN; de voorcamera (Webcam 1) blijft voor de HIVE-AprilTags. Plus de actieve-camera-indicator.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import {
  CAMERA_SITES,
  REAR_CAMERA_MOUNT,
  ROBOT_ORIGIN_ABOVE_FLOOR_M,
  activeCameraIndicator,
  applyCameraMount,
  cameraFov,
  mountQuat,
  normalizeCameraId,
  otherCameraId,
  resolveCameraConfig,
} from '../../src/mujoco/robotCamera.js';
import { computePollenColorBlobs } from '../../src/mujoco/simSensors.js';
import { initActiveCameraToggle, loadStoredActiveCamera } from '../../src/ui/cameraFovSelect.js';
import { HARDWARE } from '../../src/config/hardware.js';
import { SYNTHETIC_HARDWARE_XML } from '../../src/config/hardwareXml.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const assets = path.join(root, 'public/assets');
const DEG = Math.PI / 180;
const simJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

function quatToMat([w, x, y, z]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

describe('Achtercamera: montage en zichtveld', () => {
  it('kijkt achteruit en 32° omlaag, liggend (beeld-X horizontaal)', () => {
    const m = quatToMat(mountQuat(REAR_CAMERA_MOUNT.pitchDeg, REAR_CAMERA_MOUNT.rollDeg, REAR_CAMERA_MOUNT.yawDeg));
    const fwd = [0, 1, 2].map((i) => -m[i][2]);
    assert.ok(Math.abs(fwd[0] + Math.cos(32 * DEG)) < 1e-9, `achteruit: ${fwd}`);
    assert.ok(Math.abs(fwd[2] + Math.sin(32 * DEG)) < 1e-9, `omlaag: ${fwd}`);
    assert.ok(Math.abs(m[2][0]) < 1e-9, 'beeld-X horizontaal');
    assert.ok(m[2][1] > 0, 'beeld-boven heeft +z');
  });

  it('vloerstrook in beeld (90°): van ±0,2 m tot ±2,7 m (omhoog: kijkt ver), horizon niet in beeld', () => {
    const fov = cameraFov(resolveCameraConfig(null), { dfovDeg: 90, rollDeg: 0 });
    const h = REAR_CAMERA_MOUNT.z + ROBOT_ORIGIN_ABOVE_FLOOR_M;
    const top = -REAR_CAMERA_MOUNT.pitchDeg - fov.vfovDeg / 2; // graden onder horizontaal (bovenrand)
    const bot = -REAR_CAMERA_MOUNT.pitchDeg + fov.vfovDeg / 2;
    assert.ok(top > 5, `bovenrand ${top}° onder horizontaal: geen lucht/zaal`);
    const near = h / Math.tan(bot * DEG);
    const far = h / Math.tan(top * DEG);
    assert.ok(near < 0.25 && far > 2 && far < 3.5, `vloer ${near.toFixed(2)}..${far.toFixed(2)} m`);
    // lens achter het midden, vóór de achter-intake (x −0,22)
    assert.ok(REAR_CAMERA_MOUNT.x < 0 && REAR_CAMERA_MOUNT.x > -0.22);
  });

  it('beide simulation.json-kopieën: rearMount = REAR_CAMERA_MOUNT, Webcam 2 op robot_rear_cam', () => {
    for (const p of ['robots/BIOBUZZ/simulation.json', 'public/robots/BIOBUZZ/simulation.json']) {
      const j = simJson(p);
      const cfg = resolveCameraConfig(j.webcam.camera);
      for (const k of ['x', 'y', 'z', 'pitchDeg', 'rollDeg', 'yawDeg']) assert.equal(cfg.rearMount[k], REAR_CAMERA_MOUNT[k], `${p} ${k}`);
      assert.equal(j.webcam2.configName, 'Webcam 2');
      assert.equal(j.webcam2.cameraSite, CAMERA_SITES.rear);
      assert.equal(j.webcam.cameraSite, CAMERA_SITES.front);
      // voorcamera ongewijzigd (+35°, liggend, 16,5 cm)
      assert.deepEqual(cfg.mount, { x: 0.24, y: 0, z: 0.121, pitchDeg: 35, rollDeg: 0 });
    }
  });

  it('hardwareconfig kent Webcam 1 én Webcam 2', () => {
    assert.equal(HARDWARE.webcam2.configName, 'Webcam 2');
    assert.equal(HARDWARE.webcam2.type, 'WebcamName');
    assert.match(SYNTHETIC_HARDWARE_XML, /<Webcam name="Webcam 1" \/>\s*<Webcam name="Webcam 2" \/>/);
  });
});

describe('Achtercamera in de echte scène', () => {
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

  function blobs(behindM, site, leftM = 0) {
    const model = mujoco.MjModel.mj_loadXML('/scene/biobuzz_scene.xml');
    const data = new mujoco.MjData(model);
    mujoco.mj_resetDataKeyframe(model, data, 0);
    const cfg = resolveCameraConfig(simJson('robots/BIOBUZZ/simulation.json').webcam.camera);
    assert.equal(applyCameraMount(mujoco, model, data, cfg.mount), true);
    assert.equal(applyCameraMount(mujoco, model, data, cfg.rearMount, CAMERA_SITES.rear), true);
    const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
    const q = (n) => model.jnt_qposadr[mujoco.mj_name2id(model, JNT, n)];
    const pose = { x: 0, y: -1.2, yaw: 0 };
    data.qpos.set([pose.x, pose.y, 0.059, 1, 0, 0, 0], q('robot_free'));
    // Alle POLLEN ver weg, één POLLEN `behindM` achter het robotmidden.
    for (let i = 0; i < 40; i++) {
      const id = mujoco.mj_name2id(model, JNT, `pollen_fj_${String(i).padStart(2, '0')}`);
      if (id < 0) continue;
      data.qpos.set([5 + i * 0.2, 5, 0.0506, 1, 0, 0, 0], model.jnt_qposadr[id]);
    }
    data.qpos.set([pose.x - behindM, pose.y + leftM, 0.0506, 1, 0, 0, 0], q('pollen_fj_00'));
    mujoco.mj_forward(model, data);
    const fov = cameraFov(cfg, { dfovDeg: 90, rollDeg: 0 });
    return computePollenColorBlobs(mujoco, model, data, {
      cameraSiteName: site, hfovDeg: fov.hfovDeg, vfovDeg: fov.vfovDeg, width: fov.width, height: fov.height,
    }).blobs;
  }

  it('POLLEN 0,5 m achter de robot: achtercamera ziet hem (onderste helft-ish, midden), voorcamera niet', () => {
    const rear = blobs(0.5, CAMERA_SITES.rear);
    assert.equal(rear.length, 1, JSON.stringify(rear));
    assert.ok(Math.abs(rear[0].Circle.X - 320) < 20, `midden: ${rear[0].Circle.X}`);
    assert.equal(blobs(0.5, CAMERA_SITES.front).length, 0);
  });

  it('beeld-X: bal links achter (robot +y) → X > 320 (ImuHiveAuto stuurt daarop)', () => {
    const l = blobs(0.5, CAMERA_SITES.rear, 0.15);
    const r = blobs(0.5, CAMERA_SITES.rear, -0.15);
    assert.ok(l.length === 1 && l[0].Circle.X > 360, JSON.stringify(l));
    assert.ok(r.length === 1 && r[0].Circle.X < 280, JSON.stringify(r));
  });

  it('POLLEN 1,5 m achter de robot is (omhoog gezette camera) wél in beeld, 4 m niet meer', () => {
    assert.ok(blobs(1.5, CAMERA_SITES.rear).length > 0);
    assert.equal(blobs(4, CAMERA_SITES.rear).length, 0);
  });
});

describe('Actieve camera (indicator)', () => {
  it('normalizeCameraId / otherCameraId / indicatortekst', () => {
    assert.equal(normalizeCameraId('Webcam 2'), 'rear');
    assert.equal(normalizeCameraId('achter'), 'rear');
    assert.equal(normalizeCameraId('Webcam 1'), 'front');
    assert.equal(normalizeCameraId('robot_up_cam'), 'front');
    assert.equal(normalizeCameraId('xyz'), null);
    assert.equal(otherCameraId('front'), 'rear');
    assert.equal(otherCameraId('rear'), 'front');
    assert.match(activeCameraIndicator('rear').text, /Achter.*Webcam 2/);
    assert.match(activeCameraIndicator(undefined).text, /Voor.*Webcam 1/);
  });

  function fakeDom() {
    const mk = (cam) => {
      const cls = new Set();
      const attrs = {};
      const l = [];
      return {
        dataset: { camera: cam },
        classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), has: (c) => cls.has(c) },
        setAttribute: (k, v) => { attrs[k] = v; },
        attrs,
        addEventListener: (t, f) => l.push(f),
        click: () => l.forEach((f) => f()),
        blur() {},
      };
    };
    const btns = [mk('front'), mk('rear')];
    const container = { dataset: {}, querySelectorAll: () => btns };
    const statusEl = { textContent: '', style: {} };
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    return { btns, container, statusEl, storage };
  }

  it('knoppen: actieve knop gemarkeerd, klik wisselt meteen + bewaart, setValue werkt indicator bij', () => {
    const { btns, container, statusEl, storage } = fakeDom();
    const seen = [];
    const t = initActiveCameraToggle(container, { value: 'front', statusEl, storage, onChange: (id) => seen.push(id) });
    assert.ok(btns[0].classList.has('is-active'));
    assert.equal(btns[1].attrs['aria-pressed'], 'false');
    assert.match(statusEl.textContent, /Voor/);
    btns[1].click();
    assert.deepEqual(seen, ['rear']);
    assert.equal(t.value(), 'rear');
    assert.ok(btns[1].classList.has('is-active') && !btns[0].classList.has('is-active'));
    assert.equal(container.dataset.active, 'rear');
    assert.match(statusEl.textContent, /Achter · Webcam 2|Achter \(vloer\) · Webcam 2/);
    assert.equal(loadStoredActiveCamera(storage), 'rear');
    t.setValue('front');
    assert.match(statusEl.textContent, /Voor/);
    assert.equal(btns[0].attrs['aria-pressed'], 'true');
  });

  it('index.html heeft de Voor/Achter-knoppen en main.js koppelt viewer + adapter', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id="camActiveToggle"[\s\S]*data-camera="front"[\s\S]*data-camera="rear"/);
    assert.match(html, /id="camActiveInfo"/);
    const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
    assert.match(main, /viewer\?\.setActiveCamera\?\.\(id\)/);
    assert.match(main, /applyCameraMount\([^;]*cameraCfg\.rearMount, 'robot_rear_cam'\)/);
    const rend = fs.readFileSync(path.join(root, 'src/worlds/biobuzz/renderer.js'), 'utf8');
    assert.match(rend, /setActiveCamera\(id\)/);
    assert.match(rend, /frameColor: this\._activeCam === 'rear'/);
  });
});
