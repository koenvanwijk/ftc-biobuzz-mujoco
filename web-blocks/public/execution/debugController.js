/**
 * Blok-niveau step-debugger voor de OpMode-worker (klassiek script: importScripts).
 *
 * De gedebugde JS bevat `highlightBlock('<blockId>');` vóór elk statement-blok
 * (Blockly STATEMENT_PREFIX, zie blocksBridge `getDebugJavaScript`). De worker registreert een
 * native `highlightBlock` die `controller.onHighlight(id)` aanroept; zodra die `true` geeft stopt
 * `runInterpreterSteps` (tussen twee interpreter-stappen) en staat de OpMode "gepauzeerd bij blok X"
 * (X is het blok dat als VOLGENDE wordt uitgevoerd).
 *
 * Stap-varianten (aanroepdiepte = aantal actieve gebruikers-functieframes op de interpreter-stateStack,
 * zie `callDepth`; `onHighlight(id, depth)` krijgt die diepte mee):
 *   - Stap      ('step')  pauzeer bij het eerstvolgende blok (dus ook binnen een aangeroepen functie);
 *   - Stap over ('over')  pauzeer bij het eerstvolgende blok met diepte <= huidige diepte (functie-body wordt overgeslagen);
 *   - Stap uit  ('out')   pauzeer bij het eerstvolgende blok met diepte < huidige diepte (functie is teruggekeerd).
 * Breakpoints en Pauzeer gelden altijd, ook binnen een overgeslagen functie.
 *
 * Variabelen: `collectVariables` leest de scope-keten van de interpreter (lokaal → globaal) en serialiseert
 * waarden veilig (afgekapt) zodat ze via postMessage naar de hoofdthread kunnen.
 *
 * Deze module heeft geen DOM/worker-afhankelijkheden en is daarom unit-testbaar (tests/unit/debugController.test.js).
 */
(function (root) {
  'use strict';

  function createDebugController() {
    let enabled = false;
    /** 'run' = doorlopen tot breakpoint/pauze; 'step' = pauzeer bij eerstvolgende highlight;
     *  'over' = pauzeer bij eerstvolgende highlight met diepte <= refDepth; 'out' = diepte < refDepth. */
    let mode = 'run';
    /** Aanroepdiepte bij het laatste highlight-blok (null = nog geen). */
    let lastDepth = null;
    /** Blok dat vlak vóór het huidige blok is gehighlight (= laatst uitgevoerde blok). */
    let prevBlockId = null;
    /** Referentiediepte voor 'over' / 'out'. */
    let refDepth = 0;
    let paused = false;
    let pauseRequested = false;
    let currentBlockId = null;
    let reason = null;
    let breakpoints = new Set();

    return {
      /** Nieuwe sessie (INIT). startPaused → pauzeer bij het allereerste blok. */
      configure(opts) {
        const o = opts || {};
        enabled = !!o.enabled;
        breakpoints = new Set((o.breakpoints || []).map(String));
        mode = enabled && o.startPaused ? 'step' : 'run';
        paused = false;
        pauseRequested = false;
        currentBlockId = null;
        lastDepth = null;
        prevBlockId = null;
        refDepth = 0;
        reason = null;
      },
      /** Terug naar niet-actief (STOP/DONE/ERROR). */
      reset() {
        enabled = false;
        mode = 'run';
        paused = false;
        pauseRequested = false;
        currentBlockId = null;
        lastDepth = null;
        prevBlockId = null;
        refDepth = 0;
        reason = null;
        breakpoints = new Set();
      },
      get enabled() { return enabled; },
      get paused() { return paused; },
      get pauseRequested() { return pauseRequested; },
      get mode() { return mode; },
      get currentBlockId() { return currentBlockId; },
      get reason() { return reason; },
      /** Aanroepdiepte van het laatst gehighlighte blok (null zolang er nog geen was). */
      get depth() { return lastDepth; },
      /** Het blok dat vlak vóór het huidige blok is uitgevoerd (null aan het begin). */
      get prevBlockId() { return prevBlockId; },
      setBreakpoints(ids) {
        breakpoints = new Set((ids || []).map(String));
      },
      hasBreakpoint(id) { return breakpoints.has(String(id)); },
      /**
       * Aangeroepen door de native highlightBlock. Retourneert true als de uitvoering nu moet pauzeren.
       */
      onHighlight(id, depth) {
        prevBlockId = currentBlockId;
        currentBlockId = id == null ? null : String(id);
        const d = typeof depth === 'number' && isFinite(depth) ? depth : 0;
        lastDepth = d;
        if (!enabled) return false;
        let why = null;
        if (mode === 'step') why = 'step';
        else if (mode === 'over' && d <= refDepth) why = 'step';
        else if (mode === 'out' && d < refDepth) why = 'step';
        else if (pauseRequested) why = 'pause';
        else if (currentBlockId !== null && breakpoints.has(currentBlockId)) why = 'breakpoint';
        if (!why) return false;
        paused = true;
        pauseRequested = false;
        mode = 'run';
        reason = why;
        return true;
      },
      /** Stap: hervat en pauzeer bij het eerstvolgende blok. Retourneert true als we echt gepauzeerd waren. */
      step() {
        if (!enabled) return false;
        const was = paused;
        paused = false;
        pauseRequested = false;
        mode = 'step';
        return was;
      },
      /**
       * Stap over: hervat en pauzeer bij het eerstvolgende blok op dezelfde (of lagere) diepte; een aangeroepen
       * functie draait dus zonder te pauzeren (breakpoints/Pauzeer erin blijven werken).
       * Zonder bekend huidig blok gedraagt dit zich als Stap.
       */
      stepOver() {
        if (!enabled) return false;
        const was = paused;
        paused = false;
        pauseRequested = false;
        if (lastDepth === null) mode = 'step';
        else { mode = 'over'; refDepth = lastDepth; }
        return was;
      },
      /** Stap uit: hervat tot het eerstvolgende blok op lagere diepte (huidige functie is teruggekeerd). */
      stepOut() {
        if (!enabled) return false;
        const was = paused;
        paused = false;
        pauseRequested = false;
        if (lastDepth === null) mode = 'step';
        else { mode = 'out'; refDepth = lastDepth; }
        return was;
      },
      /** Doorgaan: hervat tot breakpoint / Pauzeer / einde. */
      resume() {
        if (!enabled) return false;
        const was = paused;
        paused = false;
        pauseRequested = false;
        mode = 'run';
        return was;
      },
      /** Pauzeer bij het eerstvolgende blok. */
      requestPause() {
        if (!enabled || paused) return;
        pauseRequested = true;
      },
      /** Pauzeer direct (OpMode staat in een async wait: sleep/idle) — geen highlight nodig. */
      pauseNow() {
        if (!enabled) return false;
        paused = true;
        pauseRequested = false;
        mode = 'run';
        reason = 'pause';
        return true;
      },
    };
  }


  /**
   * Aanroepdiepte: aantal actieve aanroepen van gebruikers-functies (JS-functies met een AST-body) op de
   * stateStack van de JS-Interpreter. Een CallExpression/NewExpression-state met `doneExec_` en `func_.node`
   * is zo'n aanroep die nog loopt (de state blijft op de stack tot de functie terugkeert). Native functies
   * (zoals highlightBlock zelf, motoren, telemetry) hebben geen `node` en tellen niet mee.
   * Blokken in `runOpMode` staan dus op diepte 1, blokken in een aangeroepen procedure op 2, enz.
   * Robuust omdat het puur uit de echte call-stack komt (geen tellers die uit de pas raken bij
   * returns/uitzonderingen/recursie).
   */
  function callDepth(interpreter) {
    const stack = interpreter && interpreter.stateStack;
    if (!stack) return 0;
    let depth = 0;
    for (let i = 0; i < stack.length; i++) {
      const st = stack[i];
      const t = st.node && st.node.type;
      if ((t === 'CallExpression' || t === 'NewExpression') && st.doneExec_ && st.func_ && st.func_.node) depth++;
    }
    return depth;
  }

  const MAX_TEXT = 120;
  const MAX_ITEMS = 8;
  const MAX_NEST = 2;

  function clip(str, n) {
    str = String(str);
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  /**
   * Serialiseer een interpreter-waarde (primitief of pseudo-object) veilig tot een korte, afgekapte tekst.
   * Voert nooit interpreter-code uit (geen getters/toString), volgt cycli niet en kapt af.
   */
  function serializeValue(interpreter, v, nest, seen) {
    nest = nest || 0;
    seen = seen || [];
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
    if (t === 'boolean') return String(v);
    if (t === 'string') return JSON.stringify(clip(v, 60));
    const IObj = interpreter && interpreter.constructor && interpreter.constructor.Object;
    if (!IObj || !(v instanceof IObj)) return clip(String(v), 40);
    if (v.class === 'Function') return '[functie]';
    if (seen.indexOf(v) >= 0) return '[cyclisch]';
    if (v.class === 'Array') {
      if (nest >= MAX_NEST) return '[…]';
      const len = v.properties && v.properties.length;
      const n = typeof len === 'number' ? len : 0;
      const items = [];
      for (let i = 0; i < Math.min(n, MAX_ITEMS); i++) {
        items.push(serializeValue(interpreter, v.properties[i], nest + 1, seen.concat([v])));
      }
      return '[' + items.join(', ') + (n > MAX_ITEMS ? `, … (+${n - MAX_ITEMS})` : '') + ']';
    }
    if (v.class === 'Date' || v.class === 'RegExp' || v.class === 'Error') {
      try { return clip(String(v.data !== undefined ? v.data : v.class), 40); } catch (_) { return v.class; }
    }
    if (nest >= MAX_NEST) return '{…}';
    const keys = Object.keys(v.properties || {});
    const parts = [];
    for (let i = 0; i < Math.min(keys.length, MAX_ITEMS); i++) {
      parts.push(keys[i] + ': ' + serializeValue(interpreter, v.properties[keys[i]], nest + 1, seen.concat([v])));
    }
    return '{' + parts.join(', ') + (keys.length > MAX_ITEMS ? `, … (+${keys.length - MAX_ITEMS})` : '') + '}';
  }

  /** Namen van alle globale properties (ingebouwde objecten + native API's); die tonen we niet als variabelen. */
  function globalNames(interpreter, globalObject) {
    // In initFunc is interpreter.globalObject nog niet gezet: geef dan het globalObject-argument mee.
    return new Set(Object.keys((globalObject || interpreter.globalObject).properties));
  }

  /**
   * Lees de variabelen uit de scope-keten van de huidige interpreter-state (lokaal → globaal).
   * `baseline` = Set namen die geen gebruikersvariabelen zijn (zie globalNames, direct na init genomen).
   * Functies (runOpMode, procedures) worden overgeslagen. Resultaat is gewone JSON:
   * [{ name, scope: 'lokaal'|'globaal', text }].
   */
  function collectVariables(interpreter, baseline, maxVars) {
    const out = [];
    const limit = maxVars || 60;
    const seen = new Set();
    const IObj = interpreter.constructor.Object;
    let scope = null;
    const stack = interpreter.stateStack;
    if (stack && stack.length) scope = stack[stack.length - 1].scope;
    for (; scope && out.length < limit; scope = scope.parentScope) {
      const isGlobal = !scope.parentScope;
      const props = scope.object.properties;
      for (const name of Object.keys(props)) {
        if (out.length >= limit) break;
        if (seen.has(name)) continue; // afgeschaduwd door lokale variabele
        if (!isGlobal && (name === 'arguments' || name === 'this')) continue;
        if (isGlobal && baseline && baseline.has(name)) continue;
        if (isGlobal && (name === 'window' || name === 'self' || name === 'this')) continue;
        const val = props[name];
        if (val instanceof IObj && val.class === 'Function') continue;
        seen.add(name);
        out.push({ name, scope: isGlobal ? 'globaal' : 'lokaal', text: clip(serializeValue(interpreter, val), MAX_TEXT) });
      }
    }
    return out;
  }

  /**
   * Voer interpreter-stappen uit tot: einde, budget op, async wait, stop, of debugger-pauze.
   * Gooit interpreter-fouten door (aanroeper vangt).
   * @returns {'finished'|'budget'|'async'|'stopped'|'paused'}
   */
  function runInterpreterSteps({ interpreter, budget, controller, isStopped, isAsyncPending }) {
    for (let i = 0; i < budget; i++) {
      if (isStopped()) return 'stopped';
      if (isAsyncPending()) return 'async';
      if (controller && controller.paused) return 'paused';
      const ok = interpreter.step();
      if (!ok) return 'finished';
      if (controller && controller.paused) return 'paused';
    }
    return 'budget';
  }

  root.FtcDebug = {
    createDebugController,
    runInterpreterSteps,
    callDepth,
    serializeValue,
    globalNames,
    collectVariables,
  };
})(typeof self !== 'undefined' ? self : globalThis);
