/**
 * Gamepad-brug: Browser Gamepad API + toetsenbord/on-screen fallback.
 *
 * Mapping (Logitech/Xbox-achtig):
 *  - axes[1] = LeftStickY (omhoog = negatief in browser; FTC: omhoog vaak -1 na negatie in Blocks)
 *  - axes[3] of axes[5] = RightStickY
 *  - buttons: A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Back=8, Start=9
 * Doodzone: 0.05 (documenteer in SUPPORT_MATRIX / README).
 */
const DEADZONE = 0.05;

function applyDeadzone(v) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

export class GamepadBridge {
  constructor(index) {
    this.index = index;
    this._override = {
      leftStickX: 0,
      leftStickY: 0,
      rightStickX: 0,
      rightStickY: 0,
      leftTrigger: 0,
      rightTrigger: 0,
    };
    this._buttons = Object.create(null);
    this._prevButtons = Object.create(null);
  }

  /** Externe override van on-screen / toetsenbord (waarden -1..1). */
  setAxisOverride(name, value) {
    if (name in this._override) this._override[name] = applyDeadzone(Number(value) || 0);
  }

  setButtonOverride(name, pressed) {
    this._buttons[name] = !!pressed;
  }

  poll() {
    this._prevButtons = { ...this._buttonsFromPad(), ...this._buttons };
    // keep overrides; pad merges in getters
  }

  _pad() {
    const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
    return pads?.[this.index] || null;
  }

  _axis(padIndexFallback, overrideKey) {
    const o = this._override[overrideKey];
    if (o) return o;
    const pad = this._pad();
    if (!pad) return 0;
    return applyDeadzone(pad.axes[padIndexFallback] || 0);
  }

  _btn(name, padButtonIndex) {
    if (name in this._buttons) return !!this._buttons[name];
    const pad = this._pad();
    if (!pad || padButtonIndex == null) return false;
    return !!pad.buttons[padButtonIndex]?.pressed;
  }

  _buttonsFromPad() {
    const names = {
      A: 0, B: 1, X: 2, Y: 3,
      LeftBumper: 4, RightBumper: 5,
      Back: 8, Start: 9,
      LeftStickButton: 10, RightStickButton: 11,
      DpadUp: 12, DpadDown: 13, DpadLeft: 14, DpadRight: 15,
    };
    const out = {};
    for (const [n, i] of Object.entries(names)) out[n] = this._btn(n, i);
    return out;
  }

  getLeftStickX() { return this._axis(0, 'leftStickX'); }
  getLeftStickY() { return this._axis(1, 'leftStickY'); }
  getRightStickX() { return this._axis(2, 'rightStickX'); }
  getRightStickY() {
    const pad = this._pad();
    if (this._override.rightStickY) return this._override.rightStickY;
    if (!pad) return 0;
    const idx = pad.axes.length > 3 ? 3 : 2;
    return applyDeadzone(pad.axes[idx] || 0);
  }
  getLeftTrigger() {
    if (this._override.leftTrigger) return this._override.leftTrigger;
    const pad = this._pad();
    return pad?.buttons[6]?.value || 0;
  }
  getRightTrigger() {
    if (this._override.rightTrigger) return this._override.rightTrigger;
    const pad = this._pad();
    return pad?.buttons[7]?.value || 0;
  }

  getA() { return this._btn('A', 0); }
  getB() { return this._btn('B', 1); }
  getX() { return this._btn('X', 2); }
  getY() { return this._btn('Y', 3); }
  getLeftBumper() { return this._btn('LeftBumper', 4); }
  getRightBumper() { return this._btn('RightBumper', 5); }
  getBack() { return this._btn('Back', 8); }
  getStart() { return this._btn('Start', 9); }
  getDpadUp() { return this._btn('DpadUp', 12); }
  getDpadDown() { return this._btn('DpadDown', 13); }
  getDpadLeft() { return this._btn('DpadLeft', 14); }
  getDpadRight() { return this._btn('DpadRight', 15); }
  getAtRest() {
    return !this.getLeftStickX() && !this.getLeftStickY() &&
      !this.getRightStickX() && !this.getRightStickY() &&
      !this.getLeftTrigger() && !this.getRightTrigger();
  }

  /** Generieke getProp zoals Blocks: gamepad1.getLeftStickY() */
  get(prop) {
    const fn = this[`get${prop}`];
    if (typeof fn === 'function') return fn.call(this);
    // WasPressed stubs
    if (String(prop).endsWith('WasPressed') || String(prop).endsWith('WasReleased')) return false;
    throw new Error(`Gamepad-property niet ondersteund: ${prop}`);
  }
}

/** Bouw object met getX-methodes die de generator verwacht. */
export function bindGamepadMethods(gp) {
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('get')) {
        const name = prop.slice(3);
        return () => target.get(name);
      }
      return undefined;
    },
  };
  return new Proxy(gp, handler);
}

export const GAMEPAD_DEADZONE = DEADZONE;
