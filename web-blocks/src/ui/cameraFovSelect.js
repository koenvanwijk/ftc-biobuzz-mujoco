/**
 * Keuzelijst "Camera-zichtveld" (Brio 4K-presets), bewaard in localStorage.
 * Los van de DOM testbaar: storage en select-element worden meegegeven.
 */
import { CAMERA_DFOV_STORAGE_KEY, pickDfov, presetLabel } from '../mujoco/robotCamera.js';

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // bv. privémodus / sandbox zonder storage
  }
}

/** Opgeslagen preset of de standaard (onbekende waarde → standaard). */
export function loadStoredDfov(cfg, storage = defaultStorage()) {
  let raw = null;
  try {
    raw = storage?.getItem?.(CAMERA_DFOV_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  return pickDfov(cfg, raw);
}

export function saveDfov(dfovDeg, storage = defaultStorage()) {
  try {
    storage?.setItem?.(CAMERA_DFOV_STORAGE_KEY, String(dfovDeg));
  } catch {
    /* storage vol of geblokkeerd: keuze geldt dan alleen voor deze sessie */
  }
}

/** Opties: standaard eerst, daarna aflopend (90°, 78°, 65°). */
export function presetOptions(cfg) {
  const rest = cfg.dfovPresetsDeg.filter((d) => d !== cfg.defaultDfovDeg).sort((a, b) => b - a);
  return [cfg.defaultDfovDeg, ...rest].map((d) => ({ value: String(d), label: presetLabel(cfg, d) }));
}

/** Korte omschrijving, bv. "Brio 4K 90° diagonaal → 66° × 52° bij 640×480". */
export function describeFov(fov) {
  return (
    `${fov.shortName} ${fov.dfovDeg}° diagonaal → ` +
    `${Math.round(fov.hfovDeg)}° × ${Math.round(fov.vfovDeg)}° (H × V) bij ${fov.width}×${fov.height}`
  );
}

/**
 * Vul de select en koppel change → onChange(dfovDeg). Bewaart de keuze.
 * @returns {{ setValue: (d: number) => void }}
 */
export function initCameraFovSelect(selectEl, cfg, { value, onChange, storage } = {}) {
  if (!selectEl) return { setValue() {} };
  const doc = selectEl.ownerDocument;
  selectEl.textContent = '';
  for (const o of presetOptions(cfg)) {
    const opt = doc.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  }
  selectEl.value = String(pickDfov(cfg, value));
  selectEl.addEventListener('change', () => {
    const d = pickDfov(cfg, selectEl.value);
    saveDfov(d, storage === undefined ? defaultStorage() : storage);
    // Pijltjestoetsen sturen de robot: focus terug naar de pagina na een keuze.
    selectEl.blur();
    onChange?.(d);
  });
  return {
    setValue(d) {
      selectEl.value = String(pickDfov(cfg, d));
    },
  };
}
