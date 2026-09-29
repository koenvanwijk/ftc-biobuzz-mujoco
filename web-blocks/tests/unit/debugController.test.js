import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// debugController.js is a classic script (importScripts in the worker); load it into a sandbox.
function loadDebug() {
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/execution/debugController.js'), 'utf8'), sandbox);
  return sandbox.FtcDebug;
}

function loadInterpreter() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const f of ['acorn.js', 'interpreter.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'vendor/js-interpreter', f), 'utf8'), sandbox, { filename: f });
  }
  return vm.runInContext('Interpreter', sandbox);
}

const { createDebugController, runInterpreterSteps } = loadDebug();
const Interpreter = loadInterpreter();

const PROGRAM = `
var log = [];
function runOpMode() {
  highlightBlock('A'); log.push('a');
  highlightBlock('B'); log.push('b');
  while (n < 3) {
    highlightBlock('C'); n++; log.push('c' + n);
  }
  highlightBlock('D'); log.push('d');
}
var n = 0;
runOpMode();
`;

function makeSession(opts) {
  const ctl = createDebugController();
  ctl.configure(opts);
  let async = false;
  const interp = new Interpreter(PROGRAM, (i, g) => {
    i.setProperty(g, 'highlightBlock', i.createNativeFunction((id) => { ctl.onHighlight(id); return true; }));
  });
  const run = (budget = 5000) =>
    runInterpreterSteps({
      interpreter: interp,
      budget,
      controller: ctl,
      isStopped: () => false,
      isAsyncPending: () => async,
    });
  const logOf = () => JSON.parse(JSON.stringify(interp.pseudoToNative(interp.getProperty(interp.globalObject, 'log'))));
  return { ctl, interp, run, logOf, setAsync: (v) => { async = v; } };
}

describe('debugController state machine', () => {
  it('is inert when disabled', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: false, startPaused: true, breakpoints: ['X'] });
    assert.equal(ctl.onHighlight('X'), false);
    assert.equal(ctl.paused, false);
    assert.equal(ctl.step(), false);
  });

  it('startPaused pauses at the very first block', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true, startPaused: true });
    assert.equal(ctl.onHighlight('A'), true);
    assert.equal(ctl.paused, true);
    assert.equal(ctl.currentBlockId, 'A');
    assert.equal(ctl.reason, 'step');
  });

  it('continue runs until a breakpoint', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true, breakpoints: ['B'] });
    assert.equal(ctl.onHighlight('A'), false);
    assert.equal(ctl.onHighlight('B'), true);
    assert.equal(ctl.reason, 'breakpoint');
    assert.equal(ctl.resume(), true);
    assert.equal(ctl.onHighlight('C'), false);
  });

  it('pause request pauses at the next block; pauseNow works during async waits', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true });
    ctl.requestPause();
    assert.equal(ctl.onHighlight('A'), true);
    assert.equal(ctl.reason, 'pause');
    ctl.resume();
    assert.equal(ctl.pauseNow(), true);
    assert.equal(ctl.paused, true);
  });

  it('accepts highlight ids that never exist in the editor (just a string)', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true, startPaused: true });
    assert.equal(ctl.onHighlight(undefined), true);
    assert.equal(ctl.currentBlockId, null);
  });

  it('reset clears everything (STOP while paused)', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true, startPaused: true, breakpoints: ['A'] });
    ctl.onHighlight('A');
    ctl.reset();
    assert.equal(ctl.paused, false);
    assert.equal(ctl.enabled, false);
    assert.equal(ctl.hasBreakpoint('A'), false);
  });
});

describe('runInterpreterSteps with real JS-Interpreter', () => {
  it('Stap: advances exactly one block per step', () => {
    const s = makeSession({ enabled: true, startPaused: true });
    const seen = [];
    assert.equal(s.run(), 'paused');
    seen.push(s.ctl.currentBlockId);
    assert.deepEqual(s.logOf(), []); // paused BEFORE block A body
    for (let i = 0; i < 4; i++) {
      s.ctl.step();
      assert.equal(s.run(), 'paused');
      seen.push(s.ctl.currentBlockId);
    }
    assert.deepEqual(seen, ['A', 'B', 'C', 'C', 'C']);
    assert.deepEqual(s.logOf(), ['a', 'b', 'c1', 'c2']);
    s.ctl.step();
    assert.equal(s.run(), 'paused');
    assert.equal(s.ctl.currentBlockId, 'D');
    s.ctl.step();
    assert.equal(s.run(), 'finished');
    assert.deepEqual(s.logOf(), ['a', 'b', 'c1', 'c2', 'c3', 'd']);
  });

  it('Doorgaan: runs to the breakpoint inside the loop, then to the end', () => {
    const s = makeSession({ enabled: true, startPaused: true, breakpoints: ['C'] });
    assert.equal(s.run(), 'paused'); // first block A (startPaused)
    s.ctl.resume();
    assert.equal(s.run(), 'paused');
    assert.equal(s.ctl.currentBlockId, 'C');
    assert.equal(s.ctl.reason, 'breakpoint');
    assert.deepEqual(s.logOf(), ['a', 'b']);
    s.ctl.setBreakpoints([]);
    s.ctl.resume();
    assert.equal(s.run(), 'finished');
    assert.deepEqual(s.logOf(), ['a', 'b', 'c1', 'c2', 'c3', 'd']);
  });

  it('a paused session does not execute any steps (frozen)', () => {
    const s = makeSession({ enabled: true, startPaused: true });
    assert.equal(s.run(), 'paused');
    const before = s.interp.getStateStack().length;
    for (let i = 0; i < 3; i++) assert.equal(s.run(), 'paused');
    assert.equal(s.interp.getStateStack().length, before);
  });

  it('non-debug run is unaffected (no highlight → runs to the end)', () => {
    const s = makeSession({ enabled: false });
    assert.equal(s.run(), 'finished');
  });

  it('returns "async" / "budget" without pausing', () => {
    const s = makeSession({ enabled: true });
    s.setAsync(true);
    assert.equal(s.run(), 'async');
    s.setAsync(false);
    assert.equal(s.run(3), 'budget');
  });

  it('Pauzeer inside a busy loop pauses at the next block without freezing', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true });
    const interp = new Interpreter(
      'var i = 0; while (true) { highlightBlock("L"); i++; }',
      (it, g) => it.setProperty(g, 'highlightBlock', it.createNativeFunction((id) => { ctl.onHighlight(id); return true; })),
    );
    const args = { interpreter: interp, budget: 200, controller: ctl, isStopped: () => false, isAsyncPending: () => false };
    assert.equal(runInterpreterSteps(args), 'budget'); // yields to the event loop
    ctl.requestPause();
    assert.equal(runInterpreterSteps(args), 'paused');
    assert.equal(ctl.reason, 'pause');
  });
});

describe('worker copies', () => {
  it('src/execution/opModeWorker.js is identical to public/execution/opModeWorker.js', () => {
    const a = fs.readFileSync(path.join(root, 'src/execution/opModeWorker.js'), 'utf8');
    const b = fs.readFileSync(path.join(root, 'public/execution/opModeWorker.js'), 'utf8');
    assert.equal(a, b);
  });
});
