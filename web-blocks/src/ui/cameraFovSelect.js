/**
 * Keuzelijst "Camera-zichtveld" (Brio 4K-presets), bewaard in localStorage.
 * Los van de DOM testbaar: storage en select-element worden meegegeven.
 */
import {
  ACTIVE_CAMERA_STORAGE_KEY,
  CAMERA_DFOV_STORAGE_KEY,
  activeCameraIndicator,
  normalizeCameraId,
  pickDfov,
  presetLabel,
} from '../mujoco/robotCamera.js';

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

/**
 * Korte omschrijving, bv. "Brio 4K 90° diagonaal → 66° × 52° (H × V) bij 640×480".
 */
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

/** Opgeslagen actieve camera ('front' | 'rear'), standaard voor. */
export function loadStoredActiveCamera(storage = defaultStorage()) {
  let raw = null;
  try {
    raw = storage?.getItem?.(ACTIVE_CAMERA_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  return normalizeCameraId(raw) || 'front';
}

export function saveActiveCamera(id, storage = defaultStorage()) {
  try {
    storage?.setItem?.(ACTIVE_CAMERA_STORAGE_KEY, normalizeCameraId(id) || 'front');
  } catch {
    /* alleen voor deze sessie */
  }
}

/**
 * Camerakeuze Voor / Achter: knoppen met `data-camera="front|rear"` in `container`.
 * De actieve knop krijgt class `is-active` + aria-pressed="true"; `statusEl` toont de tekst.
 * Klik → setValue + onChange(id) + opslaan. setValue werkt de indicator meteen bij.
 * @returns {{ setValue: (id: string) => string, value: () => string }}
 */
export function initActiveCameraToggle(container, { value, onChange, storage, statusEl } = {}) {
  let current = normalizeCameraId(value) || 'front';
  const buttons = () => Array.from(container?.querySelectorAll?.('[data-camera]') || []);
  const paint = () => {
    const ind = activeCameraIndicator(current);
    for (const b of buttons()) {
      const on = normalizeCameraId(b.dataset?.camera) === current;
      b.classList?.toggle?.('is-active', on);
      b.setAttribute?.('aria-pressed', on ? 'true' : 'false');
    }
    if (container?.dataset) container.dataset.active = current;
    if (statusEl) {
      statusEl.textContent = ind.text;
      if (statusEl.style) statusEl.style.color = ind.color;
    }
  };
  const api = {
    setValue(id) {
      current = normalizeCameraId(id) || 'front';
      paint();
      return current;
    },
    value: () => current,
  };
  for (const b of buttons()) {
    b.addEventListener?.('click', () => {
      const id = api.setValue(b.dataset?.camera);
      saveActiveCamera(id, storage === undefined ? defaultStorage() : storage);
      b.blur?.();
      onChange?.(id);
    });
  }
  paint();
  return api;
}
