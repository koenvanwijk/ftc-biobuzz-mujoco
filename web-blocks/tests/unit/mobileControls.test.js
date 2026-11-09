import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('mobileControls wiring', () => {
  it('index heeft Touch-besturing knop en mobileControls-module bestaat', () => {
    assert.match(read('index.html'), /id="btnTouchControls"/);
    assert.match(read('index.html'), />Touch-besturing</);
    assert.match(read('src/main.js'), /initMobileControls/);
    assert.match(read('src/main.js'), /setVirtualStick/);
    assert.match(read('src/main.js'), /setVirtualShoot/);
    assert.match(read('src/main.js'), /setVirtualIntake/);
    assert.match(read('src/ui/mobileControls.js'), /mobile-joystick/);
    assert.match(read('src/ui/mobileControls.js'), /mobile-shoot/);
    assert.match(read('src/ui/mobileControls.js'), /mobile-intake/);
    assert.match(read('src/ui/mobileControls.js'), /Draai je telefoon om te spelen/);
    assert.match(read('src/ui/mobileControls.js'), /max-height: 500px/);
    assert.match(read('src/ui/styles.css'), /\.mobile-joystick/);
    assert.match(read('src/ui/styles.css'), /\.mobile-shoot/);
    assert.match(read('src/ui/styles.css'), /\.mobile-intake/);
    assert.match(read('src/ui/styles.css'), /mobile-play/);
    assert.match(read('src/ui/styles.css'), /mobile-rotate/);
  });

  it('Schiet = Right Trigger, Intake = Right Bumper (REV Starter)', () => {
    const main = read('src/main.js');
    const fn = main.slice(main.indexOf('function applyKeys'));
    assert.match(fn, /virt\.shoot/);
    assert.match(fn, /rightTrigger/);
    assert.match(fn, /virt\.intake/);
    assert.match(fn, /RightBumper'[^\n]*virt\.intake/);
    assert.match(read('examples/REVStarterBotTeleOp2026.blk'), /RightTriggerPressed/);
    assert.match(read('examples/REVStarterBotTeleOp2026.blk'), /RightBumper/);
    assert.match(read('src/ui/mobileControls.js'), /top-left|Schieten \(Right Trigger\)/);
    assert.match(read('src/ui/mobileControls.js'), /Intake \(Right Bumper\)/);
    assert.match(read('src/ui/styles.css'), /\.mobile-shoot \{[^}]*left:/s);
    assert.match(read('src/ui/styles.css'), /\.mobile-intake \{[^}]*right:/s);
  });
});

describe('GamepadBridge merge: physical wins', () => {
  it('override vult aan; pad wint bij non-zero', async () => {
    const { GamepadBridge } = await import('../../src/ftc-runtime/gamepad.js');
    const gp = new GamepadBridge(0);
    const nav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { getGamepads: () => [null] },
    });
    try {
      gp.setAxisOverride('leftStickX', 0.5);
      gp.setAxisOverride('rightTrigger', 1);
      assert.equal(gp.getLeftStickX(), 0.5);
      assert.equal(gp.getRightTrigger(), 1);

      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          getGamepads: () => [{
            axes: [0.8, -0.6, 0, 0],
            buttons: Array.from({ length: 8 }, (_, i) => ({
              pressed: i === 7,
              value: i === 7 ? 0.9 : 0,
            })),
          }],
        },
      });
      assert.equal(gp.getLeftStickX(), 0.8);
      assert.equal(gp.getLeftStickY(), -0.6);
      assert.equal(gp.getRightTrigger(), 0.9);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
    }
  });
});

describe('InputHandler virtual stick/shoot/intake', () => {
  it('arcade virtuele stick + shoot-edge + intake-toggle', async () => {
    const listeners = {};
    globalThis.window = {
      addEventListener: (t, f) => { listeners[t] = f; },
      removeEventListener() {},
    };
    const nav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { getGamepads: () => [] },
    });
    try {
      const { InputHandler } = await import('../../src/worlds/biobuzz/controls.js');
      const h = new InputHandler();
      h.setVirtualStick(0.5, -1);
      let c = h.poll();
      assert.ok(c.left > c.right, 'draai naar rechts');
      h.setVirtualStick(0, 0);
      h.setVirtualShoot(true);
      c = h.poll();
      assert.equal(c.shoot, true);
      const before = c.intake;
      h.setVirtualShoot(false);
      h.setVirtualIntake(true);
      c = h.poll();
      assert.equal(c.intake, before === 1 ? 0 : 1, 'intake toggles like RB');
      h.setVirtualIntake(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
    }
  });
});
