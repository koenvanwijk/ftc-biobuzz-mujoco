import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
globalThis.window = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {} };
const { InputHandler } = await import('../../src/worlds/biobuzz/controls.js');

function press(h, k) { listeners.keydown({ key: k, code: k, preventDefault() {} }); }

describe('Idle teleop: arcade standaard (zoals REV Starter arcadeDrive)', () => {
  it('start in arcade; W = beide wielen vooruit, D = draaien', () => {
    globalThis.navigator = { getGamepads: () => [] };
    const h = new InputHandler();
    assert.equal(h.arcade, true);
    press(h, 'w');
    let c = h.poll();
    assert.equal(c.left, 1); assert.equal(c.right, 1);
    listeners.keyup({ key: 'w' });
    press(h, 'd');
    c = h.poll();
    assert.ok(c.left > 0 && c.right < 0);
  });
  it('gamepad arcade: linkerstick X stuurt (left = y + x, right = y - x)', () => {
    const axes = [0.5, -1, 0, 0];
    globalThis.navigator = { getGamepads: () => [{ axes, buttons: [] }] };
    const h = new InputHandler();
    const c = h.poll();
    assert.ok(c.left > c.right);
    assert.equal(c.arcade, true);
  });
});
