/**
 * Versleepbare horizontale balken tussen gestapelde deelpanelen (rechterkolom "Telemetry / code").
 * Elk paneel boven een balk krijgt een vaste hoogte (px); het laatste paneel vult de rest.
 * Hoogtes worden bewaard in localStorage.
 */
export const STACK_STORAGE_KEY = 'ftc-sim-side-stack-v1';
export const MIN_PANE_PX = 40;

export function clampPaneHeight(h, min = MIN_PANE_PX, max = Infinity) {
  if (!Number.isFinite(h)) return min;
  return Math.round(Math.max(min, Math.min(max, h)));
}

export function loadStackSizes(storage) {
  try {
    const v = JSON.parse(storage?.getItem(STACK_STORAGE_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function saveStackSizes(storage, sizes) {
  try { storage?.setItem(STACK_STORAGE_KEY, JSON.stringify(sizes)); } catch {}
}

/** @param {HTMLElement} container met kinderen `.stack-pane[data-pane]` */
export function initStackSplitters(container, { storage = globalThis.localStorage } = {}) {
  if (!container) return;
  const panes = [...container.querySelectorAll(':scope > .stack-pane')];
  const sizes = loadStackSizes(storage);
  panes.forEach((pane, i) => {
    const key = pane.dataset.pane;
    const min = Number(pane.dataset.min) || MIN_PANE_PX;
    if (i === panes.length - 1) { pane.classList.add('stack-fill'); return; }
    if (sizes[key]) pane.style.height = `${clampPaneHeight(sizes[key], min)}px`;
    const bar = document.createElement('div');
    bar.className = 'stack-splitter';
    bar.setAttribute('role', 'separator');
    bar.setAttribute('aria-orientation', 'horizontal');
    bar.title = 'Sleep om de hoogte te wijzigen (dubbelklik = standaard)';
    pane.after(bar);
    bar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('dragging');
      const startY = e.clientY, startH = pane.getBoundingClientRect().height;
      const move = (ev) => { pane.style.height = `${clampPaneHeight(startH + ev.clientY - startY, min)}px`; };
      const up = () => {
        bar.classList.remove('dragging');
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        sizes[key] = pane.getBoundingClientRect().height;
        saveStackSizes(storage, sizes);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    bar.addEventListener('dblclick', () => {
      pane.style.height = '';
      delete sizes[key];
      saveStackSizes(storage, sizes);
    });
  });
}
