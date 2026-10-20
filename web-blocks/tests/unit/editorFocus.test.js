import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIPBOARD_KEY,
  shouldForwardKey,
  isPasteChord,
  persistClipboard,
  restoreClipboard,
  wrapClipboardCapture,
  ensurePastePoint,
  installEditorHelpers,
  clearUndoAfterLoads,
} from '../../src/editor/editorFocus.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

class FakeTarget {
  constructor() { this.l = {}; }
  addEventListener(t, f, c) { (this.l[t] ||= []).push({ f, c: !!c }); }
  fire(t, ev) { if (ev && !ev.type) ev.type = t; for (const { f } of this.l[t] || []) f(ev); }
}

class FakeKeyboardEvent {
  constructor(type, init) { Object.assign(this, init); this.type = type; this.defaultPrevented = false; }
  preventDefault() { this.defaultPrevented = true; }
}

function fakeWin() {
  const doc = new FakeTarget();
  doc.hasFocus = () => false;
  doc.getElementById = (id) => (id === 'blocklyDiv' ? { getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }) } : null);
  doc.querySelector = () => null;
  const win = new FakeTarget();
  win.document = doc;
  win.focused = 0;
  win.focus = () => { win.focused++; };
  return win;
}

test('shouldForwardKey: gewone toetsen ja, sneltoetsen en tekstvelden nee', () => {
  assert.equal(shouldForwardKey({ key: 'w', target: { tagName: 'svg' } }), true);
  assert.equal(shouldForwardKey({ key: 'ArrowUp' }), true);
  assert.equal(shouldForwardKey({ key: 'c', ctrlKey: true }), false);
  assert.equal(shouldForwardKey({ key: 'v', metaKey: true }), false);
  assert.equal(shouldForwardKey({ key: 'x', altKey: true }), false);
  assert.equal(shouldForwardKey({ key: 'w', target: { tagName: 'INPUT' } }), false);
  assert.equal(shouldForwardKey({ key: 'w', target: { tagName: 'TEXTAREA' } }), false);
  assert.equal(shouldForwardKey({ key: 'w', target: { tagName: 'div', isContentEditable: true } }), false);
  assert.equal(shouldForwardKey({ key: 'a', isComposing: true }), false);
});

test('isPasteChord', () => {
  assert.equal(isPasteChord({ ctrlKey: true, keyCode: 86 }), true);
  assert.equal(isPasteChord({ metaKey: true, key: 'V' }), true);
  assert.equal(isPasteChord({ key: 'v' }), false);
  assert.equal(isPasteChord({ ctrlKey: true, key: 'c', keyCode: 67 }), false);
});

test('klembord: persist + restore alleen als leeg', () => {
  const st = memStorage();
  persistClipboard(st, '<xml><block type="a"/></xml>');
  assert.equal(st.getItem(CLIPBOARD_KEY), '<xml><block type="a"/></xml>');
  const w = {};
  assert.equal(restoreClipboard(w, st), true);
  assert.equal(w.savedClipboardContent, '<xml><block type="a"/></xml>');
  const w2 = { savedClipboardContent: 'eigen' };
  assert.equal(restoreClipboard(w2, st), false);
  assert.equal(w2.savedClipboardContent, 'eigen');
  assert.equal(restoreClipboard({}, memStorage()), false);
});

test('wrapClipboardCapture: vendor blijft werken en storage krijgt kopie; niet dubbel wrappen', () => {
  const st = memStorage();
  const calls = [];
  const w = { afterBlocklyClipboardCaptured(c) { calls.push(c); } };
  assert.equal(wrapClipboardCapture(w, st), true);
  assert.equal(wrapClipboardCapture(w, st), false);
  w.afterBlocklyClipboardCaptured('<xml/>');
  assert.deepEqual(calls, ['<xml/>']);
  assert.equal(st.getItem(CLIPBOARD_KEY), '<xml/>');
  assert.equal(wrapClipboardCapture({}, st), false);
});

test('ensurePastePoint: midden van blocklyDiv als muispositie ontbreekt', () => {
  const w = fakeWin();
  assert.equal(ensurePastePoint(w), true);
  assert.deepEqual([w.mouseX, w.mouseY], [300, 150]);
  assert.equal(ensurePastePoint(w), false); // al eindig
});

test('installEditorHelpers: focus bij pointerdown, toetsen naar host, preventDefault terug', () => {
  const st = memStorage();
  st.setItem(CLIPBOARD_KEY, '<xml>x</xml>');
  const w = fakeWin();
  const host = new FakeTarget();
  host.KeyboardEvent = FakeKeyboardEvent;
  const got = [];
  host.dispatchEvent = (e) => { got.push(e); if (e.key === ' ') e.preventDefault(); return true; };
  assert.equal(installEditorHelpers(w, { host, storage: st }), true);
  assert.equal(installEditorHelpers(w, { host, storage: st }), false, 'idempotent');
  assert.equal(w.savedClipboardContent, '<xml>x</xml>');
  assert.ok(w.document.l.pointerdown[0].c, 'capture-phase');
  w.document.fire('pointerdown', {});
  assert.equal(w.focused, 1);

  const ev = (key, extra = {}) => ({ key, code: key, target: { tagName: 'svg' }, prevented: false, preventDefault() { this.prevented = true; }, ...extra });
  const w1 = ev('w');
  w.fire('keydown', w1);
  w.fire('keyup', ev('w'));
  const sp = ev(' ');
  w.fire('keydown', sp);
  w.fire('keydown', ev('c', { ctrlKey: true }));
  assert.deepEqual(got.map((e) => `${e.type}:${e.key}`), ['keydown:w', 'keyup:w', 'keydown: ']);
  assert.equal(w1.prevented, false);
  assert.equal(sp.prevented, true);

  // Ctrl+V zonder muisbeweging → plakpunt gezet
  w.savedClipboardContent = undefined;
  w.document.fire('keydown', { ctrlKey: true, keyCode: 86, key: 'v' });
  assert.equal(w.savedClipboardContent, '<xml>x</xml>');
  assert.ok(Number.isFinite(w.mouseX));
});

test('clearUndoAfterLoads: undo-stack leeg na FINISHED_LOADING, niet na andere events', () => {
  let cleared = 0;
  const ls = [];
  const ws = { addChangeListener: (f) => ls.push(f), clearUndo: () => { cleared++; } };
  const now = (f) => f();
  assert.equal(clearUndoAfterLoads(ws, 'finished_loading', { defer: now }), true);
  assert.equal(clearUndoAfterLoads(ws, 'finished_loading', { defer: now }), false, 'idempotent');
  ls[0]({ type: 'create' });
  assert.equal(cleared, 0);
  ls[0]({ type: 'finished_loading' });
  assert.equal(cleared, 1);
  const ws2 = { addChangeListener: () => {}, clearUndo: () => { cleared++; } };
  clearUndoAfterLoads(ws2, 'finished_loading', { defer: now, alreadyLoaded: true });
  assert.equal(cleared, 2);
  assert.equal(clearUndoAfterLoads({}, 'x'), false);
});
