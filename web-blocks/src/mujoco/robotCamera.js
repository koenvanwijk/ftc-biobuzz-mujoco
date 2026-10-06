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
