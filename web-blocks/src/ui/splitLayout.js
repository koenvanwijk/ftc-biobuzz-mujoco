/**
 * Resizable + focusable three-pane horizontal (desktop) / vertical (narrow) split.
 * Vanilla JS only — persists widths & collapsed state in localStorage.
 */

const STORAGE_KEY = 'ftc-blocks-layout-v1';
const PANEL_IDS = ['editor', 'sim', 'code'];
const DEFAULT_FRACS = [0.4, 0.35, 0.25];
const MIN_PX = 120;
const COLLAPSED_PX = 38;
const SPLITTER_PX = 6;

/** Focus presets: relative fractions for non-focused panels share the remainder. */
const FOCUS_PRESETS = {
  editor: [0.7, 0.15, 0.15],
  sim: [0.15, 0.7, 0.15],
  code: [0.15, 0.15, 0.7],
  equal: [...DEFAULT_FRACS],
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mainEl
 * @param {{ editor: HTMLElement, sim: HTMLElement, code: HTMLElement }} opts.panels
 * @param {HTMLElement[]} opts.splitters  — [between editor/sim, between sim/code]
 * @param {(info: { widths: number[], collapsed: boolean[], focus: string|null }) => void} [opts.onLayoutChange]
 * @returns {{ applyPreset: (name: string) => void, destroy: () => void }}
 */
export function initSplitLayout({ mainEl, panels, splitters, onLayoutChange }) {
  if (!mainEl || !panels?.editor || !panels?.sim || !panels?.code) {
    console.warn('[splitLayout] missing elements');
    return { applyPreset() {}, destroy() {} };
  }

  /** @type {number[]} fraction of available space (sum ≈ 1) when not collapsed */
  let fracs = [...DEFAULT_FRACS];
  /** @type {boolean[]} */
  let collapsed = [false, false, false];
  /** @type {string|null} 'editor'|'sim'|'code'|null */
  let focus = null;
  let dragging = null; // { splitterIndex, startPos, startSizes }
  let suppressWinResize = false;
  let mq = window.matchMedia('(max-width: 1100px)');

  const panelEls = [panels.editor, panels.sim, panels.code];

  loadState();
  bindChrome();
  applyLayout();
  notify();

  const onMq = () => {
    applyLayout();
    notify();
  };
  mq.addEventListener?.('change', onMq);

  const onWinResize = () => {
    // Re-apply px from fracs when window size changes (keep proportions).
    // Skip when we synthesized the event so renderers still receive it.
    if (suppressWinResize || dragging) return;
    applyLayout();
  };
  window.addEventListener('resize', onWinResize);

  // Observe sim panel so callers can resize Three/MuJoCo even without window resize.
  let ro = null;
  try {
    ro = new ResizeObserver(() => {
      onLayoutChange?.({ widths: currentPxWidths(), collapsed: [...collapsed], focus });
    });
    ro.observe(panels.sim);
  } catch {
    /* ResizeObserver optional */
  }

  for (let i = 0; i < splitters.length; i++) {
    const s = splitters[i];
    if (!s) continue;
    s.addEventListener('pointerdown', (e) => beginDrag(e, i));
  }

  function isVertical() {
    return mq.matches;
  }

  function availableSize() {
    const rect = mainEl.getBoundingClientRect();
    const splitterTotal = SPLITTER_PX * (splitters.filter(Boolean).length);
    return Math.max(0, (isVertical() ? rect.height : rect.width) - splitterTotal);
  }

  function currentPxWidths() {
    return panelEls.map((el) => {
      const r = el.getBoundingClientRect();
      return isVertical() ? r.height : r.width;
    });
  }

  function beginDrag(e, splitterIndex) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const sizes = currentPxWidths();
    dragging = {
      splitterIndex,
      startPos: isVertical() ? e.clientY : e.clientX,
      startSizes: sizes,
    };
    // Expand both adjacent panels if either is collapsed so drag is meaningful.
    const a = splitterIndex;
    const b = splitterIndex + 1;
    if (collapsed[a]) collapsed[a] = false;
    if (collapsed[b]) collapsed[b] = false;
    focus = null;
    updateFocusButtons();

    mainEl.classList.add('is-dragging');
    setIframePointerEvents(false);
    try {
      splitters[splitterIndex]?.setPointerCapture?.(e.pointerId);
    } catch { /* ignore */ }

    const onMove = (ev) => onDrag(ev);
    const onUp = (ev) => endDrag(ev, onMove, onUp);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onDrag(e) {
    if (!dragging) return;
    const delta = (isVertical() ? e.clientY : e.clientX) - dragging.startPos;
    const i = dragging.splitterIndex;
    const a = dragging.startSizes[i];
    const b = dragging.startSizes[i + 1];
    let newA = a + delta;
    let newB = b - delta;
    const minA = collapsed[i] ? COLLAPSED_PX : MIN_PX;
    const minB = collapsed[i + 1] ? COLLAPSED_PX : MIN_PX;
    if (newA < minA) {
      newB -= minA - newA;
      newA = minA;
    }
    if (newB < minB) {
      newA -= minB - newB;
      newB = minB;
    }
    // Apply temporary px, then convert pair to fracs among all three.
    const sizes = [...dragging.startSizes];
    sizes[i] = newA;
    sizes[i + 1] = newB;
    const total = sizes.reduce((s, v) => s + v, 0) || 1;
    fracs = sizes.map((v) => v / total);
    applyLayoutFromPx(sizes);
  }

  function endDrag(_e, onMove, onUp) {
    if (!dragging) return;
    dragging = null;
    mainEl.classList.remove('is-dragging');
    setIframePointerEvents(true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    // Sync fracs from final layout
    const sizes = currentPxWidths();
    const total = sizes.reduce((s, v) => s + v, 0) || 1;
    fracs = sizes.map((v) => v / total);
    normalizeFracs();
    saveState();
    notify(true);
  }

  function applyLayoutFromPx(sizes) {
    const vert = isVertical();
    mainEl.classList.toggle('split-vertical', vert);
    mainEl.classList.toggle('split-horizontal', !vert);
    for (let i = 0; i < 3; i++) {
      const el = panelEls[i];
      el.classList.toggle('is-collapsed', collapsed[i]);
      el.classList.toggle('is-focused', focus === PANEL_IDS[i]);
      const px = collapsed[i] ? COLLAPSED_PX : Math.max(MIN_PX, sizes[i]);
      if (vert) {
        el.style.flex = `0 0 ${px}px`;
        el.style.width = '';
        el.style.height = `${px}px`;
        el.style.minWidth = '';
        el.style.minHeight = collapsed[i] ? `${COLLAPSED_PX}px` : `${MIN_PX}px`;
      } else {
        el.style.flex = `0 0 ${px}px`;
        el.style.width = `${px}px`;
        el.style.height = '';
        el.style.minWidth = collapsed[i] ? `${COLLAPSED_PX}px` : `${MIN_PX}px`;
        el.style.minHeight = '';
      }
    }
  }

  function applyLayout() {
    const vert = isVertical();
    mainEl.classList.toggle('split-vertical', vert);
    mainEl.classList.toggle('split-horizontal', !vert);
    for (const s of splitters) {
      if (!s) continue;
      s.setAttribute('aria-orientation', vert ? 'horizontal' : 'vertical');
      s.style.cursor = vert ? 'row-resize' : 'col-resize';
    }

    // Compute fracs to use (focus overrides)
    let use = [...fracs];
    if (focus && FOCUS_PRESETS[focus]) {
      use = [...FOCUS_PRESETS[focus]];
    }

    const avail = availableSize();
    const sizes = [0, 0, 0];
    let expandCount = 0;
    let expandFracSum = 0;
    for (let i = 0; i < 3; i++) {
      if (collapsed[i]) sizes[i] = COLLAPSED_PX;
      else {
        expandCount++;
        expandFracSum += use[i];
      }
    }
    const expandBudget = Math.max(0, avail - collapsed.filter(Boolean).length * COLLAPSED_PX);
    if (expandCount === 0) {
      // Shouldn't happen — force-expand middle
      collapsed[1] = false;
      sizes[1] = avail;
    } else {
      const norm = expandFracSum || 1;
      let assigned = 0;
      const expandIdx = [];
      for (let i = 0; i < 3; i++) {
        if (collapsed[i]) continue;
        expandIdx.push(i);
      }
      for (let k = 0; k < expandIdx.length; k++) {
        const i = expandIdx[k];
        if (k === expandIdx.length - 1) {
          sizes[i] = Math.max(MIN_PX, expandBudget - assigned);
        } else {
          const px = Math.max(MIN_PX, Math.round((use[i] / norm) * expandBudget));
          sizes[i] = px;
          assigned += px;
        }
      }
    }

    applyLayoutFromPx(sizes);
    updateFocusButtons();
    updateCollapseButtons();
  }

  function normalizeFracs() {
    const sum = fracs.reduce((a, b) => a + b, 0) || 1;
    fracs = fracs.map((f) => f / sum);
  }

  function setIframePointerEvents(enabled) {
    const iframe = document.getElementById('blocksFrame');
    if (iframe) iframe.style.pointerEvents = enabled ? '' : 'none';
    const canvas = document.getElementById('simCanvas');
    if (canvas) canvas.style.pointerEvents = enabled ? '' : 'none';
  }

  function toggleCollapse(index) {
    const next = !collapsed[index];
    // Don't collapse all three
    const wouldCollapseAll =
      next && collapsed.filter((c, i) => (i === index ? true : c)).length === 3;
    if (wouldCollapseAll) return;
    collapsed[index] = next;
    if (!next && focus) {
      // Expanding from collapse while focus is set — keep focus fracs
    }
    if (next && focus === PANEL_IDS[index]) {
      focus = null;
    }
    applyLayout();
    saveState();
    notify(true);
  }

  function setFocus(panelId) {
    if (panelId === 'equal' || panelId === focus) {
      focus = null;
      fracs = [...DEFAULT_FRACS];
      collapsed = [false, false, false];
    } else if (FOCUS_PRESETS[panelId]) {
      focus = panelId;
      collapsed = [false, false, false];
      fracs = [...FOCUS_PRESETS[panelId]];
    }
    applyLayout();
    saveState();
    notify(true);
  }

  function applyPreset(name) {
    if (name === 'equal' || name === 'reset') {
      setFocus('equal');
    } else if (name === 'blocks' || name === 'editor') {
      setFocus('editor');
    } else if (name === 'sim') {
      setFocus('sim');
    } else if (name === 'code') {
      setFocus('code');
    }
  }

  function bindChrome() {
    // Toolbar layout buttons
    document.querySelectorAll('[data-layout-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPreset(btn.getAttribute('data-layout-preset'));
      });
    });

    // Per-panel enlarge / collapse
    panelEls.forEach((el, index) => {
      const id = PANEL_IDS[index];
      el.querySelectorAll('[data-panel-focus]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (focus === id) setFocus('equal');
          else setFocus(id);
        });
      });
      el.querySelectorAll('[data-panel-collapse]').forEach((btn) => {
        btn.addEventListener('click', () => toggleCollapse(index));
      });
    });
  }

  function updateFocusButtons() {
    document.querySelectorAll('[data-layout-preset]').forEach((btn) => {
      const p = btn.getAttribute('data-layout-preset');
      const active =
        (p === 'equal' && !focus) ||
        (p === 'blocks' && focus === 'editor') ||
        (p === 'editor' && focus === 'editor') ||
        (p === 'sim' && focus === 'sim') ||
        (p === 'code' && focus === 'code');
      btn.classList.toggle('is-active', !!active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    panelEls.forEach((el, index) => {
      const id = PANEL_IDS[index];
      el.querySelectorAll('[data-panel-focus]').forEach((btn) => {
        btn.classList.toggle('is-active', focus === id);
        btn.title = focus === id ? 'Gelijk herstellen' : 'Vergroot paneel';
      });
    });
  }

  function updateCollapseButtons() {
    panelEls.forEach((el, index) => {
      el.querySelectorAll('[data-panel-collapse]').forEach((btn) => {
        const c = collapsed[index];
        btn.classList.toggle('is-collapsed', c);
        btn.setAttribute('aria-expanded', c ? 'false' : 'true');
        btn.title = c ? 'Uitklappen' : 'Inklappen';
        btn.textContent = c ? '▶' : '◀';
      });
    });
  }

  function notify(dispatchWin = false) {
    onLayoutChange?.({ widths: currentPxWidths(), collapsed: [...collapsed], focus });
    if (dispatchWin) {
      // Renderers listen to window 'resize'; skip our own re-apply.
      suppressWinResize = true;
      try {
        window.dispatchEvent(new Event('resize'));
      } finally {
        suppressWinResize = false;
      }
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fracs, collapsed, focus, v: 1 }),
      );
    } catch {
      /* ignore quota */
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.fracs) && data.fracs.length === 3) {
        fracs = data.fracs.map(Number);
        normalizeFracs();
      }
      if (Array.isArray(data.collapsed) && data.collapsed.length === 3) {
        collapsed = data.collapsed.map(Boolean);
        if (collapsed.every(Boolean)) collapsed = [false, false, false];
      }
      if (data.focus === 'editor' || data.focus === 'sim' || data.focus === 'code') {
        focus = data.focus;
      }
    } catch {
      /* ignore corrupt */
    }
  }

  function destroy() {
    mq.removeEventListener?.('change', onMq);
    window.removeEventListener('resize', onWinResize);
    ro?.disconnect();
  }

  return { applyPreset, destroy };
}
