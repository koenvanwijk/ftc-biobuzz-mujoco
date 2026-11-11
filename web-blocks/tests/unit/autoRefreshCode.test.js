import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DEBOUNCE_MS,
  isCodeAffectingEvent,
  shouldHoldRefresh,
  isBlocklyBusy,
  isCodePanelShowing,
  setGeneratedCodeText,
  createAutoRefreshController,
  installAutoRefresh,
} from '../../src/editor/autoRefreshCode.js';

test('debounce-standaard valt in 300–500 ms', () => {
  assert.equal(DEFAULT_DEBOUNCE_MS >= 300 && DEFAULT_DEBOUNCE_MS <= 500, true);
  assert.equal(DEFAULT_DEBOUNCE_MS, 400);
});

test('isCodeAffectingEvent: echte wijzigingen ja, UI/selectie/viewport/sleep-start nee', () => {
  for (const type of [
    'create', 'delete', 'change', 'move',
    'var_create', 'var_delete', 'var_rename',
    'comment_create', 'comment_delete', 'comment_change',
  ]) {
    assert.equal(isCodeAffectingEvent({ type }), true, type);
  }
  assert.equal(isCodeAffectingEvent({ type: 'change', element: 'field' }), true);
  assert.equal(isCodeAffectingEvent({ type: 'change', element: 'mutation' }), true);

  assert.equal(isCodeAffectingEvent(null), false);
  assert.equal(isCodeAffectingEvent({}), false);
  assert.equal(isCodeAffectingEvent({ isUiEvent: true, type: 'change' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'ui' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'ui', element: 'click' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'ui', element: 'selected' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'click' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'selected' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'viewport' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'viewport_change' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'finished_loading' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'comment_move' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'toolbox_item_select' }), false);

  assert.equal(isCodeAffectingEvent({ type: 'block_drag', isStart: true }), false);
  assert.equal(isCodeAffectingEvent({ type: 'block_drag', element: 'start' }), false);
  assert.equal(isCodeAffectingEvent({ type: 'drag', newValue: true }), false);
  assert.equal(isCodeAffectingEvent({ type: 'block_drag', isEnd: true }), true);
  assert.equal(isCodeAffectingEvent({ type: 'block_drag', element: 'end' }), true);
  assert.equal(isCodeAffectingEvent({ type: 'drag', newValue: false }), true);
});

test('shouldHoldRefresh tijdens sleep of open veld-editor', () => {
  assert.equal(shouldHoldRefresh({}), false);
  assert.equal(shouldHoldRefresh({ isDragging: true }), true);
  assert.equal(shouldHoldRefresh({ isFieldEditorOpen: true }), true);
  assert.equal(shouldHoldRefresh({ isDragging: false, isFieldEditorOpen: false }), false);
});

test('isBlocklyBusy: sleep, WidgetDiv, DropDownDiv, html-input', () => {
  assert.equal(isBlocklyBusy(null), false);
  assert.equal(isBlocklyBusy({ workspace: { isDragging: () => false } }), false);
  assert.equal(isBlocklyBusy({ workspace: { isDragging: () => true } }), true);
  assert.equal(isBlocklyBusy({
    workspace: { isDragging: () => false },
    Blockly: { WidgetDiv: { isVisible: () => true } },
  }), true);
  assert.equal(isBlocklyBusy({
    workspace: { isDragging: () => false },
    Blockly: { WidgetDiv: { isVisible: () => false }, DropDownDiv: { isVisible: () => true } },
  }), true);
  assert.equal(isBlocklyBusy({
    workspace: { isDragging: () => false },
    Blockly: { WidgetDiv: { isVisible: () => false } },
    document: { activeElement: { tagName: 'INPUT', className: 'blocklyHtmlInput', closest: () => null } },
  }), true);
});

test('isCodePanelShowing: verborgen bij Route-tab of ingeklapt paneel', () => {
  const showing = { hidden: false, closest: () => ({ hidden: false, classList: { contains: () => false } }) };
  const doc = { getElementById: (id) => (id === 'jsOut' ? showing : null) };
  assert.equal(isCodePanelShowing(doc), true);

  showing.hidden = true;
  assert.equal(isCodePanelShowing(doc), false);
  showing.hidden = false;
  showing.closest = () => ({ hidden: false, classList: { contains: (c) => c === 'is-collapsed' } });
  assert.equal(isCodePanelShowing(doc), false);
  assert.equal(isCodePanelShowing({ getElementById: () => null }), false);
});

test('setGeneratedCodeText bewaart scroll en steelt geen focus; skip bij dezelfde tekst', () => {
  const el = { textContent: 'old', scrollTop: 42 };
  assert.equal(setGeneratedCodeText(el, 'old'), false);
  assert.equal(el.scrollTop, 42);
  assert.equal(setGeneratedCodeText(el, 'nieuw'), true);
  assert.equal(el.textContent, 'nieuw');
  assert.equal(el.scrollTop, 42);
  assert.equal(setGeneratedCodeText(null, 'x'), false);
});

function fakeClock() {
  let now = 0;
  const timers = [];
  let nextId = 1;
  return {
    now: () => now,
    schedule(fn, ms) {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    cancel(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms) {
      now += ms;
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.fn();
      }
    },
  };
}

test('controller: debounce coalesces events en negeert UI', async () => {
  const clock = fakeClock();
  const calls = [];
  const c = createAutoRefreshController({
    debounceMs: 400,
    schedule: clock.schedule,
    cancel: clock.cancel,
    refresh: () => { calls.push(clock.now()); },
  });
  assert.equal(c.handleEvent({ type: 'ui', element: 'click' }), false);
  assert.equal(c.handleEvent({ type: 'selected' }), false);
  assert.equal(c.pending, false);
  assert.equal(c.handleEvent({ type: 'change' }), true);
  c.handleEvent({ type: 'move' });
  clock.advance(399);
  assert.equal(calls.length, 0);
  clock.advance(1);
  assert.deepEqual(calls, [400]);
  assert.equal(c.pending, false);
});

test('controller: wacht tijdens sleep/veldeditor en ververst daarna', async () => {
  const clock = fakeClock();
  const calls = [];
  let busy = true;
  const c = createAutoRefreshController({
    debounceMs: 400,
    schedule: clock.schedule,
    cancel: clock.cancel,
    isBusy: () => busy,
    refresh: () => { calls.push('r'); },
  });
  c.handleEvent({ type: 'create' });
  clock.advance(400);
  assert.equal(calls.length, 0, 'geen refresh tijdens sleep');
  clock.advance(400);
  assert.equal(calls.length, 0);
  busy = false;
  clock.advance(400);
  assert.deepEqual(calls, ['r']);
});

test('controller: niet genereren als het codepaneel verborgen is; wel eenmaal bij tonen', async () => {
  const clock = fakeClock();
  const calls = [];
  let visible = false;
  const c = createAutoRefreshController({
    debounceMs: 400,
    schedule: clock.schedule,
    cancel: clock.cancel,
    isPanelVisible: () => visible,
    refresh: () => { calls.push('r'); },
  });
  c.handleEvent({ type: 'delete' });
  clock.advance(400);
  assert.equal(calls.length, 0);
  assert.equal(c.pending, true);
  visible = true;
  c.notifyMaybeReady();
  clock.advance(400);
  assert.deepEqual(calls, ['r']);
});

test('controller: flyout-events worden genegeerd', () => {
  const clock = fakeClock();
  const calls = [];
  const c = createAutoRefreshController({
    debounceMs: 400,
    schedule: clock.schedule,
    cancel: clock.cancel,
    refresh: () => { calls.push('r'); },
  });
  assert.equal(c.handleEvent({ type: 'create' }, { isFlyout: true }), false);
  clock.advance(400);
  assert.equal(calls.length, 0);
});

test('controller: refreshNow slaat debounce over', async () => {
  const clock = fakeClock();
  const calls = [];
  const c = createAutoRefreshController({
    debounceMs: 400,
    schedule: clock.schedule,
    cancel: clock.cancel,
    refresh: async () => { calls.push('now'); },
  });
  c.handleEvent({ type: 'change' });
  await c.refreshNow();
  clock.advance(400);
  assert.deepEqual(calls, ['now']);
});

test('installAutoRefresh: luistert op workspace-changes en pointerup; niet dubbel', () => {
  const listeners = [];
  const docListeners = [];
  const events = [];
  const clock = fakeClock();
  const c = createAutoRefreshController({
    debounceMs: 400,
    schedule: clock.schedule,
    cancel: clock.cancel,
    refresh: () => { events.push('r'); },
  });
  const doc = {
    addEventListener: (t, f, cap) => docListeners.push({ t, f, cap }),
  };
  const ws = {
    id: 'main',
    addChangeListener: (f) => listeners.push(f),
  };
  const win = { workspace: ws, document: doc, location: { href: 'http://x/FtcOfflineBlocks.html' } };
  assert.equal(installAutoRefresh(win, c), true);
  assert.equal(installAutoRefresh(win, c), true);
  assert.equal(listeners.length, 1);
  assert.equal(docListeners.length, 1);
  assert.equal(docListeners[0].t, 'pointerup');
  assert.equal(docListeners[0].cap, true);

  listeners[0]({ type: 'ui' });
  listeners[0]({ type: 'change' });
  clock.advance(400);
  assert.deepEqual(events, ['r']);

  // Flyout-workspace-id wordt overgeslagen
  events.length = 0;
  listeners[0]({ type: 'create', workspaceId: 'flyout' });
  clock.advance(400);
  assert.equal(events.length, 0);
});
