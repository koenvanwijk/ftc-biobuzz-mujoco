/**
 * Blok-niveau step-debugger voor de OpMode-worker (klassiek script: importScripts).
 *
 * De gedebugde JS bevat `highlightBlock('<blockId>');` vóór elk statement-blok
 * (Blockly STATEMENT_PREFIX, zie blocksBridge `getDebugJavaScript`). De worker registreert een
 * native `highlightBlock` die `controller.onHighlight(id)` aanroept; zodra die `true` geeft stopt
 * `runInterpreterSteps` (tussen twee interpreter-stappen) en staat de OpMode "gepauzeerd bij blok X"
 * (X is het blok dat als VOLGENDE wordt uitgevoerd).
 *
 * Deze module heeft geen DOM/worker-afhankelijkheden en is daarom unit-testbaar (tests/unit/debugController.test.js).
 */
(function (root) {
  'use strict';

  function createDebugController() {
    let enabled = false;
    /** 'run' = doorlopen tot breakpoint/pauze; 'step' = pauzeer bij eerstvolgende highlight. */
    let mode = 'run';
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
        reason = null;
      },
      /** Terug naar niet-actief (STOP/DONE/ERROR). */
      reset() {
        enabled = false;
        mode = 'run';
        paused = false;
        pauseRequested = false;
        currentBlockId = null;
        reason = null;
        breakpoints = new Set();
      },
      get enabled() { return enabled; },
      get paused() { return paused; },
      get pauseRequested() { return pauseRequested; },
      get mode() { return mode; },
      get currentBlockId() { return currentBlockId; },
      get reason() { return reason; },
      setBreakpoints(ids) {
        breakpoints = new Set((ids || []).map(String));
      },
      hasBreakpoint(id) { return breakpoints.has(String(id)); },
      /**
       * Aangeroepen door de native highlightBlock. Retourneert true als de uitvoering nu moet pauzeren.
       */
      onHighlight(id) {
        currentBlockId = id == null ? null : String(id);
        if (!enabled) return false;
        let why = null;
        if (mode === 'step') why = 'step';
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

  root.FtcDebug = { createDebugController, runInterpreterSteps };
})(typeof self !== 'undefined' ? self : globalThis);
