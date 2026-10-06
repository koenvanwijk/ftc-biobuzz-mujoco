/**
 * Portret-camera (90° om de lens gedraaid): zichtveld H/V verwisseld voor het rechtop gezette beeld,
 * rol in de montage-quaternion, detectie blijft in het sensorframe (zoals de FTC-SDK), PiP rechtop.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ROBOT_CAMERA_FOV,
  cameraFov,
  isQuarterTurn,
  mountQuat,
  normalizeOrientation,
  resolveCameraConfig,
} from '../../src/mujoco/robotCamera.js';
import { computePollenColorBlobs } from '../../src/mujoco/simSensors.js';
import {
  describeFov,
  initCameraPortraitToggle,
  loadStoredPortrait,
  savePortrait,
} from '../../src/ui/cameraFovSelect.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const DEG = Math.PI / 180;
const near = (a, e, tol, msg) => assert.ok(Math.abs(a - e) <= tol, `${msg}: ${a} vs ${e} (±${tol})`);

function quatToMat([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
const col = (m, c) => [m[c], m[3 + c], m[6 + c]];

describe('Portret: zichtveld', () => {
  const cfg = resolveCameraConfig(null);

  it('standaard = portret; sensorframe 66,3° × 52,2° bij 640×480, rechtop 52,2° × 66,3° (480×640)', () => {
    assert.equal(cfg.orientation, 'portrait');
    const f = DEFAULT_ROBOT_CAMERA_FOV;
    assert.equal(f.orientation, 'portrait');
    assert.equal(f.rollDeg, 90);
    near(f.hfovDeg, 66.34, 0.01, 'sensor H');
    near(f.vfovDeg, 52.23, 0.01, 'sensor V');
    assert.deepEqual([f.width, f.height], [640, 480]);
    near(f.viewHfovDeg, f.vfovDeg, 1e-12, 'rechtop H = sensor V');
    near(f.viewVfovDeg, f.hfovDeg, 1e-12, 'rechtop V = sensor H');
    near(f.viewAspect, 0.75, 1e-12, 'rechtop aspect 3:4');
    assert.deepEqual([f.viewWidth, f.viewHeight], [480, 640]);
  });

  it('1280×720 portret: rechtop 52,2° × 82,1° (720×1280)', () => {
    const f = cameraFov(cfg, { width: 1280, height: 720 });
    near(f.viewHfovDeg, 52.23, 0.01, 'H');
    near(f.viewVfovDeg, 82.11, 0.05, 'V');
    assert.deepEqual([f.viewWidth, f.viewHeight], [720, 1280]);
  });

  it('liggend (rol 0) = sensorframe; rol −90° is ook portret', () => {
    const l = cameraFov(cfg, { rollDeg: 0 });
    assert.equal(l.orientation, 'landscape');
    assert.equal(l.viewHfovDeg, l.hfovDeg);
    assert.equal(l.viewAspect, l.aspect);
    assert.equal(cameraFov(cfg, { rollDeg: -90 }).orientation, 'portrait');
    assert.equal(cameraFov(resolveCameraConfig({ orientation: 'landscape' })).orientation, 'landscape');
    assert.equal(isQuarterTurn(270), true);
    assert.equal(isQuarterTurn(180), false);
    assert.equal(normalizeOrientation('Portret'), 'portrait');
    assert.equal(normalizeOrientation('liggend'), 'landscape');
    assert.equal(normalizeOrientation('schuin'), null);
  });

  it('orientation "portrait" met mount.rollDeg −90 → camera andersom gedraaid', () => {
    const c = resolveCameraConfig({ orientation: 'portrait', mount: { rollDeg: -90 } });
    assert.equal(c.mount.rollDeg, -90);
    assert.equal(c.portraitRollDeg, -90);
  });

  it('describeFov noemt portret en het rechtop gezette beeld', () => {
    assert.match(describeFov(DEFAULT_ROBOT_CAMERA_FOV), /portret \(90° gedraaid\) → 52° × 66° \(H × V\) bij 640×480 \(beeld 480×640\)/);
    assert.doesNotMatch(describeFov(cameraFov(cfg, { rollDeg: 0 })), /portret/);
  });
});

describe('Portret: montage-quaternion', () => {
  it('rol 0 = oude quaternion; rol 90°: beeld-X omhoog, beeld-boven = links, kijkrichting ongewijzigd', () => {
    assert.deepEqual(mountQuat(22.5, 0), mountQuat(22.5));
    const m = quatToMat(mountQuat(22.5, 90));
    const p = 22.5 * DEG;
    [-Math.sin(p), 0, Math.cos(p)].forEach((v, i) => near(col(m, 0)[i], v, 1e-12, `beeld-X[${i}]`));
    [0, 1, 0].forEach((v, i) => near(col(m, 1)[i], v, 1e-12, `beeld-boven[${i}]`));
    [Math.cos(p), 0, Math.sin(p)].forEach((v, i) => near(-col(m, 2)[i], v, 1e-12, `vooruit[${i}]`));
  });
});

/** Nep-wereld: camera in de oorsprong met de standaard portret-oriëntatie (pitch 0, rol 90°). */
function blobsFor(points, opts) {
  const m = quatToMat(mountQuat(0, 90));
  const names = points.map((_, i) => `pollen_${String(i).padStart(2, '0')}`);
  const mujoco = {
    mjtObj: { mjOBJ_SITE: { value: 1 }, mjOBJ_BODY: { value: 2 } },
    mj_name2id: (_m, t, n) => (t === 1 && n === 'robot_up_cam' ? 0 : -1),
    mj_id2name: (_m, _t, id) => names[id],
  };
  const data = { site_xpos: new Float64Array(3), site_xmat: new Float64Array(m), xpos: new Float64Array(points.flat()) };
  return computePollenColorBlobs(mujoco, { nbody: points.length }, data, opts);
}

describe('Portret: POLLEN-detectie in het sensorframe (640×480, zoals de FTC-SDK)', () => {
  const f = DEFAULT_ROBOT_CAMERA_FOV;
  const opts = { hfovDeg: f.hfovDeg, vfovDeg: f.vfovDeg, width: f.width, height: f.height };

  it('POLLEN 25° onder de as: lage X (wereld-onder = beeld-links), binnen beeld (½·66,3°)', () => {
    const r = blobsFor([[1, 0, -Math.tan(25 * DEG)]], opts);
    assert.equal(r.width, 640);
    assert.equal(r.height, 480);
    assert.equal(r.blobs.length, 1);
    const fx = 320 / Math.tan((f.hfovDeg / 2) * DEG);
    near(r.blobs[0].Circle.X, 320 - fx * Math.tan(25 * DEG), 1e-6, 'X');
    near(r.blobs[0].Circle.Y, 240, 1e-6, 'Y');
  });

  it('30° naar links valt buiten (½·52,2° = 26,1° horizontaal in de wereld)', () => {
    assert.equal(blobsFor([[1, Math.tan(30 * DEG), 0]], opts).blobs.length, 0);
    const r = blobsFor([[1, Math.tan(20 * DEG), 0]], opts);
    assert.ok(r.blobs[0].Circle.Y < 240, 'links in de wereld = boven in het sensorbeeld');
  });
});

describe('Portret: UI en renderer', () => {
  it('Portret-schakelaar: opslag en change-handler', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const cfg = resolveCameraConfig(null);
    assert.equal(loadStoredPortrait(cfg, storage), true, 'zonder opslag: config (portret)');
    savePortrait(false, storage);
    assert.equal(loadStoredPortrait(cfg, storage), false);
    let handler = null;
    let got = null;
    const input = { checked: false, addEventListener: (_e, h) => { handler = h; }, blur() {} };
    initCameraPortraitToggle(input, { value: true, storage, onChange: (p) => { got = p; } });
    assert.equal(input.checked, true);
    input.checked = false;
    handler();
    assert.equal(got, false);
    assert.equal(loadStoredPortrait(cfg, storage), false);
  });

  it('index.html heeft de Portret-checkbox naast de zichtveldkeuze; main.js koppelt hem', () => {
    const html = read('index.html');
    assert.match(html, /id="camFovSelect"[\s\S]*?<input type="checkbox" id="camPortrait"/);
    const main = read('src/main.js');
    assert.match(main, /initCameraPortraitToggle\(\$\('camPortrait'\)/);
    assert.match(main, /rollDeg: cameraRollDeg\(\)/);
  });

  it('renderer: PiP rechtop (rol terug, aspect/V van het rechtop gezette beeld), kijkpiramide in sensorframe', () => {
    const src = read('src/worlds/biobuzz/renderer.js');
    assert.match(src, /setFromAxisAngle\(new THREE\.Vector3\(0, 0, 1\), -roll\)/);
    assert.match(src, /this\.robotCam\.fov = pipVfov\(fov\)/);
    assert.match(src, /this\.robotCam\.aspect = pipAspect\(fov\)/);
    assert.match(src, /frustumLinePositions\(fov\)/);
    assert.match(src, /_frustumHelper\.quaternion\.copy\(quat\)/);
  });
});
