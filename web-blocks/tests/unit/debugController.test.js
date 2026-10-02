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

const { createDebugController, runInterpreterSteps, callDepth, collectVariables, globalNames, serializeValue } = loadDebug();
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


// Mimics Blockly output: STATEMENT_PREFIX highlightBlock before every statement block; procedures are functions.
const PROC_PROGRAM = `
var count, total, name, items, flag;
function helper(k) {
  highlightBlock('H1'); total = k * 2;
  highlightBlock('H2'); inner(k);
  highlightBlock('H3'); total = total + 1;
}
function inner(k) {
  highlightBlock('I1'); count = count + k;
}
function fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); }
function runOpMode() {
  highlightBlock('A'); count = 0;
  highlightBlock('B'); helper(5);
  highlightBlock('C'); name = 'bij'; flag = true; items = [1, 2, 3];
  highlightBlock('D'); count = count + 1;
}
`;

function makeProcSession(opts, program = PROC_PROGRAM) {
  const ctl = createDebugController();
  ctl.configure(opts);
  let baseline;
  const interp = new Interpreter(program + '\nrunOpMode();', (i, g) => {
    i.setProperty(g, 'highlightBlock', i.createNativeFunction((id) => { ctl.onHighlight(id, callDepth(i)); return true; }));
    baseline = globalNames(i, g);
  });
  const run = () =>
    runInterpreterSteps({ interpreter: interp, budget: 100000, controller: ctl, isStopped: () => false, isAsyncPending: () => false });
  const vars = () => Object.fromEntries(collectVariables(interp, baseline).map((v) => [v.name, v]));
  /** Voer één commando uit en geef [blockId, depth] terug (of 'finished'). */
  const go = (cmd) => {
    ctl[cmd]();
    const r = run();
    return r === 'paused' ? `${ctl.currentBlockId}@${ctl.depth}` : r;
  };
  return { ctl, interp, run, vars, go };
}

describe('call depth tracking', () => {
  it('counts only running user-function frames (natives and top level do not count)', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    const depths = [];
    s.ctl.onHighlight = ((orig) => (id, d) => { depths.push([id, d]); return orig(id, d); })(s.ctl.onHighlight);
    // startPaused pauses at A; just run everything without pausing
    s.ctl.resume();
    assert.equal(s.run(), 'finished');
    assert.deepEqual(depths, [['A', 1], ['B', 1], ['H1', 2], ['H2', 2], ['I1', 3], ['H3', 2], ['C', 1], ['D', 1]]);
  });

  it('is robust for recursion, returns inside expressions and after a function returns', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: false });
    const seen = [];
    const interp = new Interpreter(
      'function r(n) { probe(); if (n > 0) { r(n - 1); } probe(); } r(2); probe(); var x = [1,2].map(function (v) { probe(); return v; }); probe();',
      (i, g) => i.setProperty(g, 'probe', i.createNativeFunction(() => { seen.push(callDepth(i)); return true; })),
    );
    assert.equal(runInterpreterSteps({ interpreter: interp, budget: 1e6, controller: ctl, isStopped: () => false, isAsyncPending: () => false }), 'finished');
    assert.deepEqual(seen, [1, 2, 3, 3, 2, 1, 0, 2, 2, 0]);
  });

  it('callDepth of an empty/unknown interpreter is 0', () => {
    assert.equal(callDepth(null), 0);
    assert.equal(callDepth({}), 0);
  });
});

describe('Stap / Stap over / Stap uit', () => {
  it('Stap steps INTO a procedure call (blocks of the function get highlighted)', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    assert.equal(s.run(), 'paused');
    const seen = [`${s.ctl.currentBlockId}@${s.ctl.depth}`];
    for (let i = 0; i < 7; i++) seen.push(s.go('step'));
    assert.deepEqual(seen, ['A@1', 'B@1', 'H1@2', 'H2@2', 'I1@3', 'H3@2', 'C@1', 'D@1']);
    assert.equal(s.go('step'), 'finished');
  });

  it('Stap over at a call block runs the whole function and pauses at the next block in the same frame', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    assert.equal(s.go('step'), 'B@1'); // A → B (the call block)
    assert.equal(s.go('stepOver'), 'C@1'); // skips H1, H2, I1, H3
    const v = s.vars();
    assert.equal(v.total.text, '11'); // function DID run: 5*2+1
    assert.equal(v.count.text, '5');
    assert.equal(s.go('stepOver'), 'D@1');
    assert.equal(s.go('stepOver'), 'finished');
  });

  it('Stap over on a non-call block behaves like Stap', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    assert.equal(s.go('stepOver'), 'B@1'); // at A (no call)
    s.go('step'); // into helper: H1@2
    assert.equal(s.ctl.currentBlockId, 'H1');
    assert.equal(s.go('stepOver'), 'H2@2'); // plain statement inside function
  });

  it('Stap over inside a function skips nested calls and continues in the same function', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    s.go('step'); s.go('step'); // B, H1
    assert.equal(s.go('stepOver'), 'H2@2');
    assert.equal(s.go('stepOver'), 'H3@2'); // inner(k) (I1@3) skipped
    assert.equal(s.go('stepOver'), 'C@1'); // last block of helper: over returns to the caller's next block
  });

  it('Stap over still honors breakpoints inside the skipped function', () => {
    const s = makeProcSession({ enabled: true, startPaused: true, breakpoints: ['I1'] });
    s.run();
    assert.equal(s.go('step'), 'B@1');
    assert.equal(s.go('stepOver'), 'I1@3');
    assert.equal(s.ctl.reason, 'breakpoint');
    // after the breakpoint, Stap over at I1 continues to the next block on depth <= 3: H3 is depth 2 → pauses there
    assert.equal(s.go('stepOver'), 'H3@2');
  });

  it('Pauzeer during a skipped function pauses inside it', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    s.go('step'); // B
    s.ctl.stepOver();
    s.ctl.requestPause();
    assert.equal(s.run(), 'paused');
    assert.equal(s.ctl.currentBlockId, 'H1');
    assert.equal(s.ctl.reason, 'pause');
  });

  it('Stap uit runs until the current function returns', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    s.go('step'); s.go('step'); s.go('step'); // B, H1, H2
    s.go('step'); // I1@3
    assert.equal(s.ctl.currentBlockId, 'I1');
    assert.equal(s.go('stepOut'), 'H3@2'); // out of inner
    assert.equal(s.go('stepOut'), 'C@1'); // out of helper
    assert.equal(s.go('stepOut'), 'finished'); // out of runOpMode
  });

  it('Stap uit honors breakpoints in the rest of the function', () => {
    const s = makeProcSession({ enabled: true, startPaused: true, breakpoints: ['H3'] });
    s.run();
    s.go('step'); s.go('step'); // B, H1
    assert.equal(s.go('stepOut'), 'H3@2');
    assert.equal(s.ctl.reason, 'breakpoint');
  });

  it('stepOver/stepOut are inert when disabled, and fall back to Stap without a known block', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: false });
    assert.equal(ctl.stepOver(), false);
    assert.equal(ctl.stepOut(), false);
    ctl.configure({ enabled: true, startPaused: true });
    ctl.pauseNow();
    ctl.stepOver(); // no block seen yet
    assert.equal(ctl.mode, 'step');
    ctl.pauseNow();
    ctl.stepOut();
    assert.equal(ctl.mode, 'step');
  });

  it('depth is passed as a plain number; missing depth defaults to 0 (old callers)', () => {
    const ctl = createDebugController();
    ctl.configure({ enabled: true });
    ctl.onHighlight('X');
    assert.equal(ctl.depth, 0);
    ctl.onHighlight('Y', 3);
    assert.equal(ctl.depth, 3);
    assert.equal(ctl.prevBlockId, 'X');
  });
});

describe('Variabelen (waarden bij pauze)', () => {
  it('shows values after a set executed, updated at each Stap (previous block assignment)', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run(); // paused BEFORE A: count not yet assigned
    assert.equal(s.vars().count.text, 'undefined');
    s.go('step'); // paused at B; A (count = 0) executed
    assert.equal(s.ctl.prevBlockId, 'A');
    assert.equal(s.vars().count.text, '0');
    assert.equal(s.vars().count.scope, 'globaal');
    s.go('step'); // at H1: total = k*2 not yet done
    assert.equal(s.vars().total.text, 'undefined');
    assert.equal(s.vars().k.text, '5');
    assert.equal(s.vars().k.scope, 'lokaal');
    s.go('step'); // at H2: total assigned
    assert.equal(s.ctl.prevBlockId, 'H1');
    assert.equal(s.vars().total.text, '10');
  });

  it('lists locals first (function params) and hides builtins, functions and native APIs', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    s.go('step'); s.go('step'); s.go('step'); // H1 inside helper(5)
    const list = collectVariables(s.interp, globalNamesOf(s));
    assert.equal(list[0].name, 'k');
    const names = list.map((v) => v.name);
    for (const hidden of ['helper', 'inner', 'fact', 'runOpMode', 'highlightBlock', 'Math', 'Array', 'window', 'self', 'arguments', 'this']) {
      assert.ok(!names.includes(hidden), `${hidden} should not be listed`);
    }
    for (const shown of ['count', 'total', 'name', 'items', 'flag']) assert.ok(names.includes(shown), `${shown} listed`);
  });

  it('serializes strings, booleans, arrays and objects safely and truncated', () => {
    const s = makeProcSession({ enabled: true, startPaused: true });
    s.run();
    for (let i = 0; i < 7; i++) s.go('step'); // reaches D; C executed
    assert.equal(s.ctl.currentBlockId, 'D');
    const v = s.vars();
    assert.equal(v.name.text, '"bij"');
    assert.equal(v.flag.text, 'true');
    assert.equal(v.items.text, '[1, 2, 3]');
  });

  it('truncates long arrays / strings / nested objects and survives cycles', () => {
    const s = makeProcSession(
      { enabled: true, startPaused: true },
      `var big, long, nested, cyc, fn, nan, frac;
       function runOpMode() {
         highlightBlock('A');
         big = []; for (var i = 0; i < 50; i++) big.push(i);
         long = new Array(300).join('x');
         nested = {a: {b: {c: {d: 1}}}, l: [[1, [2, [3]]]]};
         cyc = {}; cyc.self = cyc;
         fn = function () {}; nan = 0 / 0; frac = 1 / 3;
         highlightBlock('B');
       }`,
    );
    s.run(); s.go('step');
    const v = s.vars();
    assert.equal(v.big.text, '[0, 1, 2, 3, 4, 5, 6, 7, … (+42)]');
    assert.ok(v.long.text.length < 70 && v.long.text.endsWith('…"'));
    assert.equal(v.nested.text, '{a: {b: {c: {d: 1}}}, l: [[1, [2, […]]]]}');
    assert.equal(v.cyc.text, '{self: [cyclisch]}');
    assert.equal(v.nan.text, 'NaN');
    assert.equal(v.frac.text, '0.333333');
    assert.equal(v.fn, undefined); // functions are not variables
    // message must be structured-clone safe (plain JSON)
    const list = collectVariables(s.interp, globalNamesOf(s));
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(list))), JSON.stringify(list));
  });

  it('serializeValue handles primitives directly and never throws on odd values', () => {
    assert.equal(serializeValue(Interpreter.prototype, undefined), 'undefined');
    assert.equal(serializeValue(Interpreter.prototype, null), 'null');
    assert.equal(serializeValue(Interpreter.prototype, 2.5), '2.5');
    assert.equal(serializeValue(Interpreter.prototype, 'a"b'), '"a\\"b"');
    assert.equal(serializeValue(Interpreter.prototype, true), 'true');
  });

  it('shows for-loop counters (Blockly controls_for uses a plain variable) and math_change results', () => {
    const s = makeProcSession(
      { enabled: true, startPaused: true },
      `var i, n;
       function runOpMode() {
         n = 0;
         for (i = 1; i <= 3; i += 1) { highlightBlock('F'); n += i; }
         highlightBlock('Z');
       }`,
    );
    s.run(); // at F, i = 1
    assert.equal(s.vars().i.text, '1');
    s.go('step');
    assert.equal(s.vars().i.text, '2');
    assert.equal(s.vars().n.text, '1'); // math_change (n += i) executed before this pause
    s.go('step');
    assert.equal(s.vars().n.text, '3');
    assert.equal(s.go('step'), 'Z@1');
    assert.equal(s.vars().n.text, '6');
  });

  it('collectVariables works after the program finished (globals only)', () => {
    const interp = new Interpreter('var a = 1;');
    interp.run();
    const base = new Set();
    assert.equal(collectVariables(interp, base).map((v) => v.name).join(), 'a');
    assert.equal(collectVariables(interp, new Set(['a'])).length, 0);
  });
});

function globalNamesOf(s) {
  // baseline = names present at init; recompute from a fresh interpreter with the same natives
  let names;
  new Interpreter('', (i, g) => {
    i.setProperty(g, 'highlightBlock', i.createNativeFunction(() => true));
    names = globalNames(i, g);
  });
  return names;
}

describe('worker wiring', () => {
  it('worker passes call depth to the controller, handles stepOver/stepOut and posts vars on pause', () => {
    const w = fs.readFileSync(path.join(root, 'public/execution/opModeWorker.js'), 'utf8');
    assert.match(w, /dbg\.onHighlight\(id, self\.FtcDebug\.callDepth\(interpreter\)\)/);
    assert.match(w, /case 'stepOver'/);
    assert.match(w, /case 'stepOut'/);
    assert.match(w, /collectVariables\(interpreter, varBaseline\)/);
  });
  it('UI has Stap over / Stap uit buttons, a Variabelen panel and the DebugDemo example (with a procedure call + variable set)', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const id of ['btnDbgStepOver', 'btnDbgStepOut', 'debugVars', 'debugVarsList']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, />Stap over</);
    assert.match(html, />Stap uit</);
    assert.match(html, /StarterBot_DebugDemo\.blk/);
    const blk = fs.readFileSync(path.join(root, 'examples/StarterBot_DebugDemo.blk'), 'utf8');
    for (const t of ['procedures_callnoreturn', 'procedures_defnoreturn', 'variables_set', 'variables_get', 'math_change', 'controls_for']) assert.match(blk, new RegExp(t));
  });
  it('runner/main wire stepOver/stepOut commands', () => {
    const m = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
    assert.match(m, /stepCommand\('stepOver'\)/);
    assert.match(m, /stepCommand\('stepOut'\)/);
    const b = fs.readFileSync(path.join(root, 'src/editor/blocksBridge.js'), 'utf8');
    assert.match(b, /variables_set: 1, math_change: 1, controls_for: 1/);
  });
  it('normal Run JS has no highlightBlock (only the debug JS)', () => {
    const b = fs.readFileSync(path.join(root, 'src/editor/blocksBridge.js'), 'utf8');
    const m = b.match(/case 'getJavaScript':[\s\S]*?break;/);
    assert.ok(m && !/highlightBlock/.test(m[0]));
  });
});

describe('worker copies', () => {
  it('src/execution/opModeWorker.js is identical to public/execution/opModeWorker.js', () => {
    const a = fs.readFileSync(path.join(root, 'src/execution/opModeWorker.js'), 'utf8');
    const b = fs.readFileSync(path.join(root, 'public/execution/opModeWorker.js'), 'utf8');
    assert.equal(a, b);
  });
});
