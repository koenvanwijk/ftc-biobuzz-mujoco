/**
 * Toetsenbord-focus + klembord voor de vendor FTC Blocks-iframe (zonder vendor-patch).
 *
 * Probleem 1 — focus: Blockly roept preventDefault() aan op mousedown in de workspace. Wie eerst op een
 * knop in de hoofdpagina klikt (INIT/START/STOP, "Open in editor"), krijgt de focus daarna niet meer
 * terug in de iframe door op een blok te klikken; Ctrl+C/V/X/Z gaan dan naar de hoofdpagina.
 * Oplossing: capture-phase pointerdown in de iframe → window.focus().
 *
 * Gevolg: toetsen landen vaker in de iframe. Toetsen zonder Ctrl/Meta/Alt buiten tekstvelden worden
 * daarom als synthetisch KeyboardEvent doorgestuurd naar de hoofdpagina, zodat gamepad-toetsen
 * (tijdens een OpMode) en idle-besturing blijven werken. preventDefault() van de hoofdpagina
 * (pijltjes/spatie tijdens een OpMode) wordt teruggezet op het originele event.
 *
 * Probleem 2 — klembord tussen OpModes: de vendor bewaart het gekopieerde blok in
 * `savedClipboardContent` (+ IndexedDB `clipboard.xml`) en plakt via `paste()` op `mouseX/mouseY`.
 * Na het openen van een andere OpMode (nieuwe iframe-pagina) is `savedClipboardContent` leeg en
 * `mouseX/mouseY` ongedefinieerd tot de muis beweegt → plakken gooit "non-finite SVGPoint".
 * Oplossing: `afterBlocklyClipboardCaptured` omwikkelen → ook naar sessionStorage; bij laden
 * terugzetten; bij Ctrl/Meta+V zonder muispositie het midden van de workspace gebruiken.
 *
 * Probleem 3 — undo: het laden van een OpMode (vendor én bridge `setBlk`) belandt op de undo-stack,
 * dus een Ctrl+Z te veel maakt het laden ongedaan (programma leeg). Oplossing: na elk
 * FINISHED_LOADING-event de undo-stack wissen.
 */

export const CLIPBOARD_KEY = 'ftcSim.blocksClipboard';

/** Mag deze toets naar de hoofdpagina (sim/gamepad)? Geen sneltoetsen, geen typen in tekstvelden. */
export function shouldForwardKey(ev) {
  if (!ev || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return false;
  if (typeof ev.key !== 'string' || !ev.key) return false;
  const t = ev.target;
  if (t) {
    const tag = String(t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
    if (t.isContentEditable) return false;
  }
  return true;
}

/** Is dit Ctrl/Meta+V? */
export function isPasteChord(ev) {
  return Boolean(ev && (ev.ctrlKey || ev.metaKey) && (ev.keyCode === 86 || String(ev.key).toLowerCase() === 'v'));
}

/** Bewaar vendor-klembordtekst (XML-string). */
export function persistClipboard(storage, content) {
  try {
    if (storage && typeof content === 'string' && content) storage.setItem(CLIPBOARD_KEY, content);
  } catch {
    /* quota / privacy-modus */
  }
}

/** Zet `savedClipboardContent` terug als die in deze iframe-pagina nog leeg is. → true als hersteld. */
export function restoreClipboard(win, storage) {
  try {
    if (!win || win.savedClipboardContent) return false;
    const v = storage?.getItem(CLIPBOARD_KEY);
    if (!v) return false;
    win.savedClipboardContent = v;
    return true;
  } catch {
    return false;
  }
}

/** Omwikkel vendor `afterBlocklyClipboardCaptured` (kopiëren/knippen) zodat het ook in storage belandt. */
export function wrapClipboardCapture(win, storage) {
  const orig = win?.afterBlocklyClipboardCaptured;
  if (typeof orig !== 'function' || orig.__ftcSimWrapped) return false;
  const wrapped = function (content) {
    persistClipboard(storage, content);
    return orig.apply(this, arguments);
  };
  wrapped.__ftcSimWrapped = true;
  win.afterBlocklyClipboardCaptured = wrapped;
  return true;
}

/** Zonder muisbeweging in deze pagina is mouseX/mouseY ongedefinieerd → midden van de workspace. */
export function ensurePastePoint(win) {
  try {
    if (Number.isFinite(win.mouseX) && Number.isFinite(win.mouseY)) return false;
    const el = win.document.getElementById('blocklyDiv') || win.document.querySelector('.blocklySvg');
    const r = el?.getBoundingClientRect?.();
    if (!r) return false;
    win.mouseX = r.left + r.width / 2;
    win.mouseY = r.top + r.height / 2;
    return true;
  } catch {
    return false;
  }
}

/**
 * Wis de undo-stack na elk laad-event, zodat Ctrl+Z het laden van de OpMode niet ongedaan maakt.
 * `ws` = Blockly-workspace, `FINISHED` = Blockly.Events.FINISHED_LOADING. → true als gekoppeld.
 */
export function clearUndoAfterLoads(ws, FINISHED, { alreadyLoaded = false, defer = (f) => setTimeout(f, 0) } = {}) {
  if (!ws || typeof ws.addChangeListener !== 'function' || typeof ws.clearUndo !== 'function' || !FINISHED) return false;
  if (ws.__ftcSimUndoHook) return false;
  ws.__ftcSimUndoHook = true;
  // Events worden async afgevuurd; wis pas nadat ze op de stack staan.
  const clear = () => defer(() => {
    try {
      ws.clearUndo();
    } catch {
      /* ignore */
    }
  });
  ws.addChangeListener((ev) => {
    if (ev && ev.type === FINISHED) clear();
  });
  if (alreadyLoaded) clear();
  return true;
}

function hookUndoWhenReady(win, tries = 300) {
  try {
    const ws = win.workspace;
    if (ws && win.Blockly?.Events?.FINISHED_LOADING) {
      clearUndoAfterLoads(ws, win.Blockly.Events.FINISHED_LOADING, { alreadyLoaded: !!win.blocksFinishedLoading });
      return;
    }
  } catch {
    return;
  }
  if (tries > 0 && /FtcOfflineBlocks\.html/i.test(String(win.location?.href || ''))) {
    setTimeout(() => hookUndoWhenReady(win, tries - 1), 100);
  }
}

/**
 * Installeer op het huidige iframe-document (same-origin). Idempotent per document.
 * @param {Window} win iframe.contentWindow
 * @param {{ host?: Window, storage?: Storage }} [opts]
 */
export function installEditorHelpers(win, { host = globalThis.window, storage = globalThis.sessionStorage } = {}) {
  let doc;
  try {
    doc = win?.document;
  } catch {
    return false; // cross-origin
  }
  if (!doc || win.__ftcSimEditorHelpers) return false;
  win.__ftcSimEditorHelpers = true;

  doc.addEventListener(
    'pointerdown',
    () => {
      try {
        if (!doc.hasFocus()) win.focus();
      } catch {
        /* ignore */
      }
    },
    true,
  );

  const forward = (ev) => {
    if (!host || host === win || !shouldForwardKey(ev)) return;
    try {
      const Ctor = host.KeyboardEvent || KeyboardEvent;
      const fwd = new Ctor(ev.type, {
        key: ev.key,
        code: ev.code,
        location: ev.location,
        repeat: ev.repeat,
        shiftKey: ev.shiftKey,
        bubbles: true,
        cancelable: true,
      });
      host.dispatchEvent(fwd);
      if (fwd.defaultPrevented) ev.preventDefault();
    } catch {
      /* ignore */
    }
  };
  win.addEventListener('keydown', forward);
  win.addEventListener('keyup', forward);

  // Vóór de vendor-keydown (document, bubble): plakpunt + klembord gegarandeerd aanwezig.
  doc.addEventListener(
    'keydown',
    (ev) => {
      if (!isPasteChord(ev)) return;
      restoreClipboard(win, storage);
      ensurePastePoint(win);
    },
    true,
  );

  wrapClipboardCapture(win, storage);
  restoreClipboard(win, storage);
  hookUndoWhenReady(win);
  return true;
}

/** Geef de editor-iframe toetsenbordfocus (zonder te scrollen). */
export function focusEditor(iframe) {
  try {
    iframe?.contentWindow?.focus();
  } catch {
    /* ignore */
  }
}
