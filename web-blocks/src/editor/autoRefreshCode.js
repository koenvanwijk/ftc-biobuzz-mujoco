/**
 * Automatisch het JS-codepaneel bijwerken na Blockly-wijzigingen,
 * zonder slepen, typen of een lopende run in de weg te zitten.
 *
 * Deze module is puur (geen DOM-verplichting) zodat debounce en event-filter
 * in unit tests te dekken zijn.
 */

/** Vertraging na de laatste relevante wijziging, voordat we opnieuw genereren. */
export const DEFAULT_DEBOUNCE_MS = 400;

/** Blockly-eventtypes die de gegenereerde code kunnen veranderen. */
const CODE_EVENT_TYPES = new Set([
  'create',
  'delete',
  'change',
  'move',
  'var_create',
  'var_delete',
  'var_rename',
  'comment_create',
  'comment_delete',
  'comment_change',
]);

/** UI / niet-inhoudelijke types (inclusief aliases van nieuwere Blockly). */
const IGNORE_EVENT_TYPES = new Set([
  'ui',
  'click',
  'selected',
  'viewport',
  'viewport_change',
  'toolbox_item_select',
  'toolbox_open',
  'theme_change',
  'marker_move',
  'finished_loading',
  'comment_move',
  'trashcan_open',
]);

/**
 * Is dit event een echte blok-/variabelewijziging (niet UI, selectie, viewport, sleep-start)?
 * @param {{ type?: string, isUiEvent?: boolean, element?: string, isStart?: boolean, isEnd?: boolean, newValue?: unknown } | null | undefined} ev
 */
export function isCodeAffectingEvent(ev) {
  if (!ev) return false;
  if (ev.isUiEvent) return false;
  const type = String(ev.type || '');
  if (!type) return false;
  if (IGNORE_EVENT_TYPES.has(type)) return false;

  // Nieuwere Blockly: BLOCK_DRAG. Alleen het einde telt (blok is geplaatst).
  if (type === 'drag' || type === 'block_drag') {
    if (ev.isStart === true || ev.element === 'start' || ev.newValue === true || ev.newValue === 'start') {
      return false;
    }
    return ev.isEnd === true || ev.element === 'end' || ev.newValue === false || ev.newValue === 'end';
  }

  if (typeof ev.element === 'string' && (type === 'ui' || ev.element === 'click' || ev.element === 'selected')) {
    return false;
  }

  return CODE_EVENT_TYPES.has(type);
}

/** Tijdens een sleep of open veld-editor/tekstinvoer niet opnieuw genereren. */
export function shouldHoldRefresh({ isDragging = false, isFieldEditorOpen = false } = {}) {
  return !!(isDragging || isFieldEditorOpen);
}

/**
 * Live: sleept de gebruiker, of staat er een veld-editor / dropdown open in de Blockly-iframe?
 * @param {Window | null | undefined} win iframe.contentWindow
 */
export function isBlocklyBusy(win) {
  try {
    const ws = win?.workspace;
    if (ws && typeof ws.isDragging === 'function' && ws.isDragging()) return true;
    const B = win?.Blockly;
    if (typeof B?.WidgetDiv?.isVisible === 'function' && B.WidgetDiv.isVisible()) return true;
    if (typeof B?.DropDownDiv?.isVisible === 'function' && B.DropDownDiv.isVisible()) return true;
    const active = win?.document?.activeElement;
    if (active) {
      const tag = String(active.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        const cls = String(active.className || '');
        if (cls.includes('blocklyHtmlInput') || active.closest?.('.blocklyWidgetDiv, .blocklyDropDownDiv')) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Zichtbaar JS-codepaneel (niet de Route-tab, niet ingeklapt).
 * @param {Document | { getElementById?: Function, querySelector?: Function }} [doc]
 */
export function isCodePanelShowing(doc) {
  try {
    const out = doc?.getElementById?.('jsOut');
    if (!out || out.hidden) return false;
    const panel = typeof out.closest === 'function'
      ? out.closest('.panel')
      : doc?.querySelector?.('.side-panel[data-panel="code"]');
    if (panel?.hidden) return false;
    if (panel?.classList?.contains('is-collapsed')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Zet de gegenereerde code in het paneel, zonder focus te stelen of de scroll onnodig te resetten.
 * @returns {boolean} of de tekst daadwerkelijk is gewijzigd
 */
export function setGeneratedCodeText(el, text) {
  if (!el) return false;
  const next = text == null ? '' : String(text);
  if (el.textContent === next) return false;
  const top = el.scrollTop;
  el.textContent = next;
  el.scrollTop = top;
  return true;
}

/**
 * Debounce-controller: verzamelt relevante workspace-events en roept `refresh` aan
 * nadat de rustperiode voorbij is, de gebruiker niet meer sleept/typt, en het paneel zichtbaar is.
 *
 * @param {object} opts
 * @param {number} [opts.debounceMs]
 * @param {(fn: Function, ms: number) => unknown} [opts.schedule]
 * @param {(id: unknown) => void} [opts.cancel]
 * @param {() => boolean} [opts.isBusy]
 * @param {() => boolean} [opts.isPanelVisible]
 * @param {() => (void|Promise<void>)} opts.refresh  alleen weergave, niet de runner voeden
 */
export function createAutoRefreshController({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  isBusy,
  isPanelVisible,
  refresh,
} = {}) {
  if (typeof refresh !== 'function') {
    throw new Error('createAutoRefreshController: refresh is verplicht');
  }

  let timer = null;
  let pending = false;
  let refreshing = false;

  const arm = () => {
    if (timer != null) cancel(timer);
    timer = schedule(tick, debounceMs);
  };

  const tick = async () => {
    timer = null;
    if (!pending || refreshing) return;
    if (typeof isBusy === 'function' && isBusy()) {
      arm();
      return;
    }
    if (typeof isPanelVisible === 'function' && !isPanelVisible()) {
      // Blijf pending; notifyMaybeReady() start opnieuw als het paneel zichtbaar wordt.
      return;
    }
    pending = false;
    refreshing = true;
    try {
      await refresh();
    } catch (e) {
      // typisch tijdens typen of halve blokken; niet de runtime-log volspammen
      console.warn('Automatisch code vernieuwen:', e && e.message ? e.message : e);
    } finally {
      refreshing = false;
      if (pending) arm();
    }
  };

  return {
    get pending() {
      return pending;
    },
    /**
     * Verwerk een Blockly-change-event.
     * @returns {boolean} of er een verversing is ingepland
     */
    handleEvent(ev, { isFlyout = false } = {}) {
      if (isFlyout) return false;
      if (!isCodeAffectingEvent(ev)) return false;
      pending = true;
      arm();
      return true;
    },
    /** Sleep/editor klaar, of JS-tab/paneel zojuist zichtbaar. */
    notifyMaybeReady() {
      if (pending) arm();
    },
    /** Direct verversen (handmatige knop). */
    async refreshNow() {
      if (timer != null) cancel(timer);
      timer = null;
      pending = false;
      refreshing = true;
      try {
        await refresh();
      } finally {
        refreshing = false;
        if (pending) arm();
      }
    },
    dispose() {
      if (timer != null) cancel(timer);
      timer = null;
      pending = false;
    },
  };
}

/**
 * Koppel de controller aan de Blockly-workspace in de vendor-iframe.
 * Idempotent per workspace; na navigatie (nieuw document) opnieuw aanroepen.
 * @returns {boolean} of de hook nu (al) actief is
 */
export function installAutoRefresh(win, controller, { retry = (fn, ms) => setTimeout(fn, ms), maxTries = 300 } = {}) {
  if (!win || !controller) return false;

  const hook = (tries) => {
    try {
      const ws = win.workspace;
      if (ws && typeof ws.addChangeListener === 'function') {
        if (!ws.__ftcAutoRefresh) {
          ws.__ftcAutoRefresh = true;
          ws.addChangeListener((ev) => {
            const flyout = !!(ws.isFlyout || (ev && ev.workspaceId && ev.workspaceId !== ws.id));
            controller.handleEvent(ev, { isFlyout: flyout });
          });
        }
        if (win.document && !win.document.__ftcAutoRefreshPointer) {
          win.document.__ftcAutoRefreshPointer = true;
          win.document.addEventListener('pointerup', () => controller.notifyMaybeReady(), true);
        }
        return true;
      }
    } catch {
      return false;
    }
    if (tries > 0 && /FtcOfflineBlocks\.html/i.test(String(win.location?.href || ''))) {
      retry(() => hook(tries - 1), 100);
      return false;
    }
    return false;
  };

  return hook(maxTries);
}
