/**
 * Robotcamera = Logitech Brio 4K: diagonaal → H/V-zichtveld, rechthoekig frustum,
 * AprilTag-zichtbaarheid per preset, keuzelijst/localStorage en setCameraResolution.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BRIO_4K_CAMERA,
  CAMERA_DFOV_STORAGE_KEY,
  DEFAULT_ROBOT_CAMERA_FOV,
  cameraFov,
  fovFromDiagonal,
  hfovFromVfov,
  isInRectFrustum,
  normalizeResolution,
  pickDfov,
  presetLabel,
  resolveCameraConfig,
  resolveFovOpts,
} from '../../src/mujoco/robotCamera.js';
import { computeAprilTagDetections } from '../../src/mujoco/simSensors.js';
import { loadStoredDfov, saveDfov, presetOptions, describeFov } from '../../src/ui/cameraFovSelect.js';
import { createVisionPortalAccess } from '../../src/ftc-runtime/visionPortal.js';
import { ROBOT_UP_CAM_FOVY, ROBOT_UP_CAM_HFOV } from '../../src/worlds/biobuzz/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual.toFixed(3)} vs ${expected} (±${tol})`);
const DEG = Math.PI / 180;

describe('Brio 4K: diagonaal zichtveld → horizontaal/verticaal', () => {
  // [diagonaal, V, H bij 16:9, H bij 4:3 (640×480)]
  const table = [
    [90, 52.2, 82.1, 66.3],
    [78, 43.3, 70.4, 55.8],
    [65, 34.7, 58.1, 45.2],
  ];
  for (const [d, v, h169, h43] of table) {
    it(`${d}° → V ${v}°, H ${h169}° (16:9), H ${h43}° (4:3)`, () => {
      const native = fovFromDiagonal(d);
      near(native.vfovDeg, v, 0.2, 'V native');
      near(native.hfovDeg, h169, 0.2, 'H 16:9');
      const crop = fovFromDiagonal(d, { outputAspect: 4 / 3 });
      near(crop.vfovDeg, v, 0.2, 'V 4:3 (blijft gelijk)');
      near(crop.hfovDeg, h43, 0.2, 'H 4:3');
      near(crop.nativeHfovDeg, h169, 0.2, 'native H gerapporteerd');
    });
  }

  it('diagonaal klopt terug uit H en V (pinhole)', () => {
    for (const d of [65, 78, 90]) {
      const f = fovFromDiagonal(d);
      const back = 2 * Math.atan(Math.hypot(Math.tan((f.hfovDeg / 2) * DEG), Math.tan((f.vfovDeg / 2) * DEG))) / DEG;
      near(back, d, 1e-6, `diag ${d}`);
    }
  });

  it('breder dan native (bv. 2:1) behoudt horizontaal en snijdt verticaal af', () => {
    const f = fovFromDiagonal(90, { outputAspect: 2 });
    near(f.hfovDeg, 82.1, 0.2, 'H');
    assert.ok(f.vfovDeg < 52.2);
  });

  it('hfovFromVfov is consistent met de 4:3-uitsnede', () => {
    near(hfovFromVfov(fovFromDiagonal(90).vfovDeg, 4 / 3), 66.3, 0.2, 'H');
  });
});

describe('Cameraconfiguratie (simulation.json → webcam.camera)', () => {
  it('standaard = Brio 4K, 90°, 640×480 → ~66.3° × 52.2°', () => {
    assert.equal(DEFAULT_ROBOT_CAMERA_FOV.model, 'Logitech Brio 4K');
    assert.equal(DEFAULT_ROBOT_CAMERA_FOV.dfovDeg, 90);
    assert.equal(DEFAULT_ROBOT_CAMERA_FOV.width, 640);
    assert.equal(DEFAULT_ROBOT_CAMERA_FOV.height, 480);
    near(DEFAULT_ROBOT_CAMERA_FOV.hfovDeg, 66.3, 0.2, 'H');
    near(DEFAULT_ROBOT_CAMERA_FOV.vfovDeg, 52.2, 0.2, 'V');
    near(ROBOT_UP_CAM_FOVY, 52.2, 0.2, 'constants.js FOVY');
    near(ROBOT_UP_CAM_HFOV, 66.3, 0.2, 'constants.js HFOV');
  });

  it('beide simulation.json-kopieën bevatten dezelfde Brio 4K-config', () => {
    const a = JSON.parse(read('robots/BIOBUZZ/simulation.json'));
    const b = JSON.parse(read('public/robots/BIOBUZZ/simulation.json'));
    assert.deepEqual(a.webcam.camera, b.webcam.camera);
    const cfg = resolveCameraConfig(b.webcam.camera);
    assert.equal(cfg.model, 'Logitech Brio 4K');
    assert.deepEqual(cfg.dfovPresetsDeg, [65, 78, 90]);
    assert.equal(cfg.defaultDfovDeg, 90);
    assert.deepEqual(cfg.resolution, { width: 640, height: 480 });
    near(cfg.nativeAspect, 16 / 9, 1e-9, 'aspect');
    assert.deepEqual(cameraFov(cfg), DEFAULT_ROBOT_CAMERA_FOV);
  });

  it('MuJoCo-XML robot_up_cam fovy = verticaal zichtveld bij 90°', () => {
    for (const p of ['public/assets/biobuzz_scene.xml', '../web/assets/biobuzz_scene.xml', '../web/public/assets/biobuzz_scene.xml', '../ftc_sim/assets/biobuzz_scene.xml']) {
      const m = /<camera name="robot_up_cam"[^>]*fovy="([\d.]+)"/.exec(read(p));
      assert.ok(m, p);
      near(Number(m[1]), DEFAULT_ROBOT_CAMERA_FOV.vfovDeg, 0.05, p);
    }
  });

  it('ontbrekende of ongeldige velden vallen terug op Brio 4K', () => {
    assert.deepEqual(resolveCameraConfig(null).dfovPresetsDeg, [...BRIO_4K_CAMERA.dfovPresetsDeg]);
    const cfg = resolveCameraConfig({ dfovPresetsDeg: [90, 65], defaultDfovDeg: 12, resolution: { width: 'x' } });
    assert.deepEqual(cfg.dfovPresetsDeg, [65, 90]);
    assert.equal(cfg.defaultDfovDeg, 90);
    assert.deepEqual(cfg.resolution, { width: 640, height: 480 });
  });

  it('pickDfov: onbekend preset → standaard 90°', () => {
    const cfg = resolveCameraConfig(null);
    assert.equal(pickDfov(cfg, '78'), 78);
    assert.equal(pickDfov(cfg, 65), 65);
    assert.equal(pickDfov(cfg, 70), 90);
    assert.equal(pickDfov(cfg, null), 90);
  });

  it('setCameraResolution 1280×720 → 16:9, volle 82° horizontaal', () => {
    const f = cameraFov(resolveCameraConfig(null), { dfovDeg: 90, width: 1280, height: 720 });
    near(f.aspect, 16 / 9, 1e-9, 'aspect');
    near(f.hfovDeg, 82.1, 0.2, 'H');
    near(f.vfovDeg, 52.2, 0.2, 'V');
    const f65 = cameraFov(resolveCameraConfig(null), { dfovDeg: 65, width: 1280, height: 720 });
    near(f65.hfovDeg, 58.1, 0.2, 'H 65°');
  });

  it('normalizeResolution weigert onzin', () => {
    assert.deepEqual(normalizeResolution(640, 480), { width: 640, height: 480 });
    assert.equal(normalizeResolution(0, 480), null);
    assert.equal(normalizeResolution('a', 480), null);
    assert.equal(normalizeResolution(99999, 480), null);
  });
});

describe('Rechthoekig frustum (geen kegel)', () => {
  const fov = (d, w = 640, h = 480) => cameraFov(resolveCameraConfig(null), { dfovDeg: d, width: w, height: h });
  const dirH = (deg) => [Math.tan(deg * DEG), 1, 0]; // x rechts, y vooruit, z omhoog
  const dirV = (deg) => [0, 1, Math.tan(deg * DEG)];

  it('30° horizontaal: zichtbaar bij 90° (½H 33.2°), niet bij 78° (½H 27.9°) of 65° (½H 22.6°)', () => {
    const p = dirH(30);
    for (const [d, vis] of [[90, true], [78, false], [65, false]]) {
      const f = fov(d);
      assert.equal(isInRectFrustum(...p, f.hfovDeg, f.vfovDeg), vis, `${d}°`);
    }
  });

  it('40° horizontaal: niet zichtbaar bij 90° in 640×480, wél bij 1280×720 (½H 41.1°)', () => {
    const p = dirH(40);
    let f = fov(90);
    assert.equal(isInRectFrustum(...p, f.hfovDeg, f.vfovDeg), false);
    f = fov(90, 1280, 720);
    assert.equal(isInRectFrustum(...p, f.hfovDeg, f.vfovDeg), true);
  });

  it('verticaal: 25° zichtbaar bij 90° (½V 26.1°), 30° niet; 20° niet bij 65° (½V 17.3°)', () => {
    let f = fov(90);
    assert.equal(isInRectFrustum(...dirV(25), f.hfovDeg, f.vfovDeg), true);
    assert.equal(isInRectFrustum(...dirV(30), f.hfovDeg, f.vfovDeg), false);
    f = fov(65);
    assert.equal(isInRectFrustum(...dirV(20), f.hfovDeg, f.vfovDeg), false);
  });

  it('hoek van het beeld: binnen de rechthoek maar buiten een kegel met ½V', () => {
    const f = fov(90);
    const p = [Math.tan(30 * DEG), 1, Math.tan(24 * DEG)];
    const offAxisDeg = Math.acos(1 / Math.hypot(...p)) / DEG;
    assert.ok(offAxisDeg > f.vfovDeg / 2, 'een kegel-test zou deze punt afwijzen');
    assert.equal(isInRectFrustum(...p, f.hfovDeg, f.vfovDeg), true);
  });

  it('achter of naast de camera is nooit zichtbaar', () => {
    assert.equal(isInRectFrustum(0, -1, 0, 170, 170), false);
    assert.equal(isInRectFrustum(1, 0, 0, 170, 170), false);
  });

  it('resolveFovOpts: H+V > alleen fovyDeg (4:3) > standaard', () => {
    assert.deepEqual(resolveFovOpts({ hfovDeg: 10, vfovDeg: 5 }), { hfovDeg: 10, vfovDeg: 5 });
    const legacy = resolveFovOpts({ fovyDeg: 52.2338 });
    near(legacy.hfovDeg, 66.3, 0.2, 'legacy H');
    const def = resolveFovOpts({});
    near(def.hfovDeg, 66.3, 0.2, 'default H');
    near(def.vfovDeg, 52.2, 0.2, 'default V');
  });
});

describe('AprilTag-detectie volgt het gekozen preset', () => {
  // Camera in de oorsprong kijkt langs wereld +X; rechts = wereld +Y, omhoog = +Z.
  const CAM = [0, 0, -1, 1, 0, 0, 0, 1, 0];
  const TAG = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const detect = (pos, fov) => {
    const xpos = new Float64Array([0, 0, 0, ...pos]);
    const xmat = new Float64Array([...CAM, ...TAG]);
    const mujoco = {
      mjtObj: { mjOBJ_SITE: { value: 1 } },
      mj_name2id: (_m, _t, n) => (n === 'robot_up_cam' ? 0 : n === 'apriltag_50' ? 1 : -1),
    };
    return computeAprilTagDetections(mujoco, {}, { site_xpos: xpos, site_xmat: xmat }, {
      tagIds: [50],
      maxRangeM: 3,
      minFacingDot: 0.55,
      hfovDeg: fov.hfovDeg,
      vfovDeg: fov.vfovDeg,
    }).detections;
  };
  const fov = (d) => cameraFov(resolveCameraConfig(null), { dfovDeg: d });

  it('tag 30° rechts op 1,5 m: gezien bij 90°, niet bij 78° en 65°', () => {
    const pos = [1.5, 1.5 * Math.tan(30 * DEG), 0];
    assert.equal(detect(pos, fov(90)).length, 1);
    assert.equal(detect(pos, fov(78)).length, 0);
    assert.equal(detect(pos, fov(65)).length, 0);
    const det = detect(pos, fov(90))[0];
    near(det.ftcPose.bearing, -30, 0.5, 'bearing (FTC: rechts = negatief)');
  });

  it('tag 20° rechts: bij alle drie zichtbaar', () => {
    const pos = [1.5, 1.5 * Math.tan(20 * DEG), 0];
    for (const d of [90, 78, 65]) assert.equal(detect(pos, fov(d)).length, 1, `${d}°`);
  });

  it('tag in de beeldhoek (30° rechts, 24° omhoog) wordt gezien bij 90° (rechthoek, geen kegel)', () => {
    const pos = [1.2, 1.2 * Math.tan(30 * DEG), 1.2 * Math.tan(24 * DEG)];
    assert.equal(detect(pos, fov(90)).length, 1);
    assert.equal(detect(pos, fov(78)).length, 0);
  });
});

describe('Keuzelijst Camera-zichtveld', () => {
  const cfg = resolveCameraConfig(null);
  const memStorage = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
  };

  it('opties: "Brio 4K 90°" (standaard) eerst, dan 78° en 65°', () => {
    assert.deepEqual(presetOptions(cfg), [
      { value: '90', label: 'Brio 4K 90°' },
      { value: '78', label: '78°' },
      { value: '65', label: '65°' },
    ]);
    assert.equal(presetLabel(cfg, 90), 'Brio 4K 90°');
  });

  it('localStorage: opslaan en teruglezen; onzin of fout → 90°', () => {
    const s = memStorage();
    assert.equal(loadStoredDfov(cfg, s), 90);
    saveDfov(65, s);
    assert.equal(s.m.get(CAMERA_DFOV_STORAGE_KEY), '65');
    assert.equal(loadStoredDfov(cfg, s), 65);
    assert.equal(loadStoredDfov(cfg, memStorage({ [CAMERA_DFOV_STORAGE_KEY]: 'abc' })), 90);
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
    assert.equal(loadStoredDfov(cfg, broken), 90);
    assert.doesNotThrow(() => saveDfov(78, broken));
    assert.equal(loadStoredDfov(cfg, null), 90);
  });

  it('index.html heeft de keuzelijst met Nederlands label', () => {
    const html = read('index.html');
    assert.ok(html.includes('id="camFovSelect"'));
    assert.ok(html.includes('Camera-zichtveld'));
  });

  it('describeFov noemt preset, H × V en resolutie', () => {
    assert.equal(
      describeFov(cameraFov(resolveCameraConfig(null), { rollDeg: 0 })),
      'Brio 4K 90° diagonaal → 66° × 52° (H × V) bij 640×480',
    );
    assert.equal(
      describeFov(DEFAULT_ROBOT_CAMERA_FOV),
      'Brio 4K 90° diagonaal, portret (90° gedraaid) → 52° × 66° (H × V) bij 640×480 (beeld 480×640)',
    );
  });
});

describe('VisionPortal.Builder.setCameraResolution', () => {
  it('main-thread runtime bewaart de resolutie in het portal', () => {
    const v = createVisionPortalAccess();
    const b = v.createBuilder();
    v.setCameraResolution(b, 1280, 720);
    assert.deepEqual(v.build(b).resolution, { width: 1280, height: 720 });
  });

  it('OpMode-worker stuurt de resolutie als __camera-command naar de sim', () => {
    const messages = [];
    const workerUrl = pathToFileURL(path.join(root, 'public/execution/opModeWorker.js')).href;
    const sandbox = { URL, console, location: { href: workerUrl }, postMessage: (m) => messages.push(m) };
    sandbox.self = sandbox;
    const ctx = vm.createContext(sandbox);
    sandbox.importScripts = (...urls) => {
      for (const u of urls) vm.runInContext(fs.readFileSync(fileURLToPath(u), 'utf8'), ctx, { filename: u });
    };
    vm.runInContext(fs.readFileSync(fileURLToPath(workerUrl), 'utf8'), ctx, { filename: 'opModeWorker.js' });
    const send = (m) => sandbox.onmessage({ data: m });
    send({
      type: 'loadInterpreter',
      acornUrl: pathToFileURL(path.join(root, 'public/vendor/js-interpreter/acorn.js')).href,
      interpreterUrl: pathToFileURL(path.join(root, 'public/vendor/js-interpreter/interpreter.js')).href,
    });
    const code = `
function runOpMode() {
  var b = visionPortalAccess.createBuilder();
  visionPortalAccess.setCameraResolution(b, 1280, 720);
  var p = visionPortalAccess.build(b);
  linearOpMode.waitForStart();
}`;
    send({ type: 'init', code, sensors: {}, supplyVoltage: 12.5, motorDefaultDirections: {}, debug: { enabled: false } });
    for (let i = 0; i < 5; i++) send({ type: 'clock', timeSec: i * 0.016, sensors: {}, gamepads: { g1: {}, g2: {} } });
    const errs = messages.filter((m) => m.type === 'error');
    assert.deepEqual(errs, []);
    const cmds = messages.filter((m) => m.type === 'commands').map((m) => m.commands.__camera).filter(Boolean);
    assert.ok(cmds.length > 0, 'geen __camera-command');
    assert.deepEqual(
      { type: cmds.at(-1).type, width: cmds.at(-1).width, height: cmds.at(-1).height },
      { type: 'cameraResolution', width: 1280, height: 720 },
    );
  });

  it('beide worker-kopieën zijn identiek', () => {
    assert.equal(read('src/execution/opModeWorker.js'), read('public/execution/opModeWorker.js'));
  });
});
