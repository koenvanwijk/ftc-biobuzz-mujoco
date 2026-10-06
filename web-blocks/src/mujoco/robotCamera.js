/**
 * Robotcamera-model: Logitech Brio 4K (één bron van waarheid voor PiP, frustum-gizmo,
 * AprilTag- en kleur-blob-detectie).
 *
 * Logitech geeft alleen het DIAGONALE zichtveld op (presets 65° / 78° / 90°) voor de
 * native 16:9-sensor. FTC (VisionPortal) streamt standaard 640×480 = 4:3: dat is een
 * uitsnede uit het midden die het VERTICALE zichtveld behoudt en de zijkanten afsnijdt.
 *
 * Pure functies (geen DOM/MuJoCo) zodat ze in node:test getest kunnen worden.
 */

const DEG = Math.PI / 180;

/** Standaardconfiguratie; `simulation.json` → `webcam.camera` mag dit overschrijven. */
export const BRIO_4K_CAMERA = Object.freeze({
  model: 'Logitech Brio 4K',
  shortName: 'Brio 4K',
  nativeAspect: 16 / 9,
  dfovPresetsDeg: Object.freeze([65, 78, 90]),
  defaultDfovDeg: 90,
  resolution: Object.freeze({ width: 640, height: 480 }),
});

/**
 * Huidige montage van de robotcamera (site/camera `robot_up_cam` in biobuzz_scene.xml), in het
 * robotframe: x vooruit, y links, z omhoog vanaf de oorsprong van de robot-body (die ligt ≈4,4 cm
 * boven de mat, dus lenshoogte boven de mat ≈ z + 0,044 m). pitchDeg = kanteling van de optische
 * as boven horizontaal (xyaxes "0 -1 0  -0.64 0 0.77" → atan2(0.64, 0.77) ≈ 39,73°).
 */
export const DEFAULT_CAMERA_MOUNT = Object.freeze({ x: 0.16, y: 0, z: 0.28, pitchDeg: 39.73 });

/** Hoogte van de oorsprong van de robot-body boven de bovenkant van de mat (m). */
export const ROBOT_ORIGIN_ABOVE_FLOOR_M = 0.044;

/** localStorage-sleutel voor het gekozen preset (diagonaal in graden). */
export const CAMERA_DFOV_STORAGE_KEY = 'ftc-sim-camera-dfov-v1';

/**
 * Horizontaal/verticaal zichtveld uit het diagonale zichtveld (pinhole-model).
 *
 * @param {number} dfovDeg  diagonaal zichtveld van de native sensor
 * @param {{ nativeAspect?: number, outputAspect?: number }} [opts]
 *   outputAspect = breedte/hoogte van de stream. Smaller dan native → vertikaal blijft,
 *   zijkanten worden afgesneden (4:3 uit 16:9). Breder dan native → horizontaal blijft.
 * @returns {{ hfovDeg: number, vfovDeg: number, nativeHfovDeg: number, nativeVfovDeg: number, aspect: number }}
 */
export function fovFromDiagonal(dfovDeg, opts = {}) {
  const nativeAspect = opts.nativeAspect > 0 ? opts.nativeAspect : 16 / 9;
  const aspect = opts.outputAspect > 0 ? opts.outputAspect : nativeAspect;
  const d = Math.min(179, Math.max(1, Number(dfovDeg) || 90));
  const tanD = Math.tan((d / 2) * DEG);
  const diagNorm = Math.hypot(nativeAspect, 1);
  const tanH = (tanD * nativeAspect) / diagNorm;
  const tanV = tanD / diagNorm;
  const nativeHfovDeg = (2 * Math.atan(tanH)) / DEG;
  const nativeVfovDeg = (2 * Math.atan(tanV)) / DEG;
  let hfovDeg;
  let vfovDeg;
  if (aspect <= nativeAspect) {
    vfovDeg = nativeVfovDeg;
    hfovDeg = (2 * Math.atan(tanV * aspect)) / DEG;
  } else {
    hfovDeg = nativeHfovDeg;
    vfovDeg = (2 * Math.atan(tanH / aspect)) / DEG;
  }
  return { hfovDeg, vfovDeg, nativeHfovDeg, nativeVfovDeg, aspect };
}

/** Horizontaal zichtveld bij gegeven verticaal zichtveld en beeldverhouding. */
export function hfovFromVfov(vfovDeg, aspect = 4 / 3) {
  return (2 * Math.atan(Math.tan((vfovDeg / 2) * DEG) * aspect)) / DEG;
}

/** Geldige resolutie of null. */
export function normalizeResolution(width, height) {
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 8192 || h > 8192) {
    return null;
  }
  return { width: w, height: h };
}

/**
 * Normaliseer `webcam.camera.mount` → { x, y, z, pitchDeg } of null (geen mount = MJCF ongewijzigd).
 * Ontbrekende velden vallen terug op DEFAULT_CAMERA_MOUNT; onzinnige waarden worden begrensd.
 */
export function resolveCameraMount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v, def, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, n)) : def;
  };
  const d = DEFAULT_CAMERA_MOUNT;
  return {
    x: num(raw.x, d.x, -0.5, 0.5),
    y: num(raw.y, d.y, -0.5, 0.5),
    z: num(raw.z, d.z, -0.1, 1.0),
    pitchDeg: num(raw.pitchDeg, d.pitchDeg, -89, 89),
  };
}

/**
 * MuJoCo-quaternion (w, x, y, z) voor een camera/site in het robotframe die vooruit kijkt met
 * kanteling `pitchDeg` (positief = omhoog). MuJoCo-camera: lokaal X = rechts, Y = boven, kijkt
 * langs −Z. Rechts = robot −y, boven = (−sin p, 0, cos p), −Z = vooruit = (cos p, 0, sin p).
 * Rotatie = Ry(−p) · R0 met R0 (p = 0) als quaternion (0.5, 0.5, −0.5, −0.5).
 */
export function mountQuat(pitchDeg) {
  const h = (-(Number(pitchDeg) || 0) * DEG) / 2;
  const a = [Math.cos(h), 0, Math.sin(h), 0]; // Ry(−p)
  const b = [0.5, 0.5, -0.5, -0.5]; // R0
  const q = [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
  const n = Math.hypot(...q) || 1;
  return q.map((v) => v / n);
}

/**
 * Zet de montage van `robot_up_cam` (site én MuJoCo-camera) in het geladen model. Alle verbruikers
 * (PiP, frustum-gizmo, AprilTag- en POLLEN-detectie) lezen site_xpos/site_xmat en volgen dus vanzelf.
 * @returns {boolean} true als de site gevonden en aangepast is
 */
export function applyCameraMount(mujoco, model, data, mount, name = 'robot_up_cam') {
  const m = resolveCameraMount(mount);
  if (!m || !mujoco || !model) return false;
  const SITE = mujoco.mjtObj?.mjOBJ_SITE?.value;
  const CAM = mujoco.mjtObj?.mjOBJ_CAMERA?.value;
  const q = mountQuat(m.pitchDeg);
  const pos = [m.x, m.y, m.z];
  let ok = false;
  const write = (posArr, quatArr, id) => {
    for (let i = 0; i < 3; i++) posArr[id * 3 + i] = pos[i];
    for (let i = 0; i < 4; i++) quatArr[id * 4 + i] = q[i];
  };
  const sid = SITE == null ? -1 : mujoco.mj_name2id(model, SITE, name);
  if (sid >= 0 && model.site_pos && model.site_quat) {
    write(model.site_pos, model.site_quat, sid);
    ok = true;
  }
  const cid = CAM == null ? -1 : mujoco.mj_name2id(model, CAM, name);
  if (cid >= 0 && model.cam_pos && model.cam_quat) write(model.cam_pos, model.cam_quat, cid);
  if (ok && data && typeof mujoco.mj_forward === 'function') mujoco.mj_forward(model, data);
  return ok;
}

/** Lenshoogte boven de mat (m) voor een mount (robotframe-z + oorsprong-hoogte). */
export function mountHeightAboveFloor(mount) {
  const m = resolveCameraMount(mount) || DEFAULT_CAMERA_MOUNT;
  return m.z + ROBOT_ORIGIN_ABOVE_FLOOR_M;
}

/** Normaliseer `simulation.json` → `webcam.camera` (ontbrekende velden = Brio 4K). */
export function resolveCameraConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const presets = Array.isArray(r.dfovPresetsDeg)
    ? r.dfovPresetsDeg.map(Number).filter((v) => v > 0 && v < 180)
    : [];
  const dfovPresetsDeg = presets.length ? [...new Set(presets)].sort((a, b) => a - b) : [...BRIO_4K_CAMERA.dfovPresetsDeg];
  const def = Number(r.defaultDfovDeg);
  const defaultDfovDeg = dfovPresetsDeg.includes(def)
    ? def
    : dfovPresetsDeg.includes(BRIO_4K_CAMERA.defaultDfovDeg)
      ? BRIO_4K_CAMERA.defaultDfovDeg
      : dfovPresetsDeg[dfovPresetsDeg.length - 1];
  let nativeAspect = BRIO_4K_CAMERA.nativeAspect;
  if (typeof r.nativeAspect === 'string' && /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(r.nativeAspect)) {
    const [a, b] = r.nativeAspect.split(':').map(Number);
    if (a > 0 && b > 0) nativeAspect = a / b;
  } else if (Number(r.nativeAspect) > 0) {
    nativeAspect = Number(r.nativeAspect);
  }
  const res = normalizeResolution(r.resolution?.width, r.resolution?.height) || { ...BRIO_4K_CAMERA.resolution };
  return {
    model: typeof r.model === 'string' && r.model ? r.model : BRIO_4K_CAMERA.model,
    shortName: typeof r.shortName === 'string' && r.shortName ? r.shortName : BRIO_4K_CAMERA.shortName,
    nativeAspect,
    dfovPresetsDeg,
    defaultDfovDeg,
    resolution: res,
    mount: resolveCameraMount(r.mount),
  };
}

/** Kies een geldig preset (onbekende/opgeslagen waarde → standaard). */
export function pickDfov(cfg, value) {
  const v = Number(value);
  return cfg.dfovPresetsDeg.includes(v) ? v : cfg.defaultDfovDeg;
}

/**
 * Volledige camerabeschrijving voor renderer en detectie.
 * @returns {{ model: string, shortName: string, dfovDeg: number, width: number, height: number,
 *   aspect: number, hfovDeg: number, vfovDeg: number }}
 */
export function cameraFov(cfg, { dfovDeg, width, height } = {}) {
  const c = cfg && cfg.dfovPresetsDeg ? cfg : resolveCameraConfig(cfg);
  const d = pickDfov(c, dfovDeg);
  const res = normalizeResolution(width, height) || c.resolution;
  const { hfovDeg, vfovDeg, aspect } = fovFromDiagonal(d, {
    nativeAspect: c.nativeAspect,
    outputAspect: res.width / res.height,
  });
  return {
    model: c.model,
    shortName: c.shortName,
    dfovDeg: d,
    width: res.width,
    height: res.height,
    aspect,
    hfovDeg,
    vfovDeg,
  };
}

/** Standaard (Brio 4K, 90°, 640×480): hfov ≈ 66.3°, vfov ≈ 52.2°. */
export const DEFAULT_ROBOT_CAMERA_FOV = Object.freeze(cameraFov(resolveCameraConfig(null)));

/** Label in de keuzelijst: standaard "Brio 4K 90°", de rest "78°", "65°". */
export function presetLabel(cfg, dfovDeg) {
  return dfovDeg === cfg.defaultDfovDeg ? `${cfg.shortName} ${dfovDeg}°` : `${dfovDeg}°`;
}

/**
 * Rechthoekige frustumtest in het FTC-cameraframe (X rechts, Y vooruit, Z omhoog):
 * |horizontale hoek| ≤ hfov/2 én |verticale hoek| ≤ vfov/2 (pinhole, geen kegel).
 */
export function isInRectFrustum(x, y, z, hfovDeg, vfovDeg) {
  if (!(y > 1e-6)) return false;
  return (
    Math.abs(x) <= y * Math.tan((hfovDeg / 2) * DEG) + 1e-12 &&
    Math.abs(z) <= y * Math.tan((vfovDeg / 2) * DEG) + 1e-12
  );
}

/**
 * Zichtveld-opties voor detectiefuncties normaliseren.
 * Voorkeur: hfovDeg + vfovDeg. Alleen fovyDeg (oud) → horizontaal via `aspect` (standaard 4:3).
 * Niets → Brio 4K standaard.
 */
export function resolveFovOpts(opts = {}) {
  const h = Number(opts.hfovDeg);
  const v = Number(opts.vfovDeg);
  if (h > 0 && v > 0) return { hfovDeg: h, vfovDeg: v };
  const fovy = Number(opts.fovyDeg);
  if (fovy > 0) {
    const aspect = Number(opts.aspect) > 0 ? Number(opts.aspect) : 4 / 3;
    return { hfovDeg: hfovFromVfov(fovy, aspect), vfovDeg: fovy };
  }
  return { hfovDeg: DEFAULT_ROBOT_CAMERA_FOV.hfovDeg, vfovDeg: DEFAULT_ROBOT_CAMERA_FOV.vfovDeg };
}
