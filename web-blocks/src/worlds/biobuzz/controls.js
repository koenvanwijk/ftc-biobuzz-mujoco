/**
 * Idle BIOBUZZ teleop: keyboard + gamepad tank/arcade (port of ftc_sim/controls.py).
 * Only active when no Blocks OpMode owns the robot (see main.js opModeOwns).
 *
 * Default = arcade, same as REV Starter Bot TeleOp arcadeDrive (left stick:
 * Y = throttle, X = turn; left = y + x, right = y - x).
 * Idle keys (arcade): W/S or ↑/↓ throttle, A/D or ←/→ turn.
 * T toggles to tank (W/S left, I/K or ↑/↓ right) and back; E intake; C reverse; Space/F shoot; X place; R reset.
 *
 * OpMode keyboard → gamepad1 overrides live in main.js applyKeys
 * (W/S → leftStickY, I/K·↑/↓ → rightStickY, ←/→ → leftStickX;
 *  E=RB, C=LB, X=X, Space/F=RT, G=A, B=B, Y=Y, U/J/H/L=Dpad).
 *
 * Intake latched (default ON) — E / R1(RB) toggles; C / L1(LB) = rear FIFO out while held.
 * Space/F / R2(RT) = shoot (R2 must not toggle intake).
 * X / gamepad X = FIFO rear → flower stack (or drop).
 * On-screen joystick (setVirtualStick) + shoot (setVirtualShoot) for phones;
 * physical gamepad sticks/buttons win when non-zero.
 */
export class InputHandler {
  constructor() {
    this.arcade = true; // arcade from the start, like REV Starter Bot arcadeDrive
    this.keys = new Set();
    this.shootEdge = false;
    this.resetEdge = false;
    this.toggleModeEdge = false;
    this.placeNectarEdge = false;
    this.intakeOn = true; // stays on until toggled off
    this._prevShootBtn = false;
    this._prevIntakeToggle = false;
    this._prevPlaceBtn = false;
    this._prevE = false;
    // On-screen joystick / shoot (FTC stick: up = negative Y). Physical pad wins when non-zero.
    this._virtLx = 0;
    this._virtLy = 0;
    this._virtShoot = false;
    this._prevVirtShoot = false;
    this._virtIntake = false;
    this._prevVirtIntake = false;
    this._onKeyDown = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.add(k);
      if (e.code === 'Space' || k === 'f') {
        e.preventDefault();
        this.shootEdge = true;
      }
      if (k === 'r') this.resetEdge = true;
      if (k === 't') {
        this.arcade = !this.arcade;
        this.toggleModeEdge = true;
      }
      if (k === 'e' && !this._prevE) {
        this.intakeOn = !this.intakeOn;
      }
      if (k === 'x') this.placeNectarEdge = true;
      this._prevE = k === 'e' ? true : this._prevE;
    };
    this._onKeyUp = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
      this.keys.delete(e.key);
      if (k === 'e') this._prevE = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /**
   * On-screen left stick in FTC/browser units (−1..1). Merged in poll() when pad sticks are at rest.
   * @param {number} leftStickX
   * @param {number} leftStickY
   */
  setVirtualStick(leftStickX, leftStickY) {
    this._virtLx = Number(leftStickX) || 0;
    this._virtLy = Number(leftStickY) || 0;
  }

  /** On-screen shoot (Right Trigger / Space). Edge while held → cmd.shoot; held → flywheel. */
  setVirtualShoot(pressed) {
    this._virtShoot = !!pressed;
  }

  /** On-screen intake (Right Bumper / E). Edge toggles intake latch, like physical RB in idle. */
  setVirtualIntake(pressed) {
    this._virtIntake = !!pressed;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  poll() {
    const cmd = {
      left: 0,
      right: 0,
      intake: 0,
      shoot: false,
      flywheel: this.keys.has(' ') || this.keys.has('f'),
      placeNectar: false,
      reset: false,
      modeChanged: false,
      arcade: this.arcade,
    };

    if (this.shootEdge) {
      cmd.shoot = true;
      this.shootEdge = false;
    }
    if (this.placeNectarEdge) {
      cmd.placeNectar = true;
      this.placeNectarEdge = false;
    }
    if (this.resetEdge) {
      cmd.reset = true;
      this.resetEdge = false;
    }
    if (this.toggleModeEdge) {
      cmd.modeChanged = true;
      this.toggleModeEdge = false;
    }

    const pad = navigator.getGamepads?.()?.[0];
    let left = 0;
    let right = 0;
    let reverse = false;

    if (pad) {
      const dead = 0.12;
      let ly = -axis(pad, 1);
      let ry = -axis(pad, 3);
      let rx = axis(pad, 2);
      let lx = axis(pad, 0);
      if (Math.abs(ry) < 0.05 && pad.axes.length > 4) ry = -axis(pad, 4);
      ly = Math.abs(ly) < dead ? 0 : ly;
      ry = Math.abs(ry) < dead ? 0 : ry;
      rx = Math.abs(rx) < dead ? 0 : rx;
      lx = Math.abs(lx) < dead ? 0 : lx;

      if (this.arcade) {
        // REV Starter arcadeDrive: x = leftStickX, y = -leftStickY
        left = ly + lx;
        right = ly - lx;
      } else if (Math.abs(ry) < dead && Math.abs(rx) > dead) {
        left = ly + rx;
        right = ly - rx;
      } else {
        left = ly;
        right = ry;
      }

      // R1 / RB (button 5) only — do NOT include R2/RT (7); that is shoot
      const rb = pad.buttons.length > 5 && !!pad.buttons[5]?.pressed;
      if (rb && !this._prevIntakeToggle) this.intakeOn = !this.intakeOn;
      this._prevIntakeToggle = rb;

      // L1 / LB (button 4) only — not L2/LT
      if (pad.buttons.length > 4 && pad.buttons[4]?.pressed) reverse = true;

      // R2 / RT = shoot (button 7 and/or trigger axes on some pads)
      let trigger = pad.axes.length > 5 ? axis(pad, 5) : 0;
      const trigPressed =
        trigger > 0.4 ||
        (pad.axes.length > 4 && axis(pad, 4) > 0.5) ||
        (pad.buttons.length > 7 && !!pad.buttons[7]?.pressed);
      cmd.flywheel ||= !!trigPressed;
      if (trigPressed && !this._prevShootBtn) cmd.shoot = true;
      this._prevShootBtn = !!trigPressed;

      // Xbox X (button 2) — FIFO place from rear
      const placeBtn = pad.buttons.length > 2 && pad.buttons[2]?.pressed;
      if (placeBtn && !this._prevPlaceBtn) cmd.placeNectar = true;
      this._prevPlaceBtn = !!placeBtn;
    } else {
      const down = (k) => this.keys.has(k);
      const arcadeKeys =
        this.arcade || down('a') || down('d') || down('ArrowLeft') || down('ArrowRight');
      if (arcadeKeys) {
        const throttle = (down('w') || down('ArrowUp') ? 1 : 0) + (down('s') || down('ArrowDown') ? -1 : 0);
        const turn = (down('d') || down('ArrowRight') ? 1 : 0) + (down('a') || down('ArrowLeft') ? -1 : 0);
        left = throttle + turn;
        right = throttle - turn;
      } else {
        if (down('w')) left += 1;
        if (down('s')) left -= 1;
        if (down('i') || down('ArrowUp')) right += 1;
        if (down('k') || down('ArrowDown')) right -= 1;
      }
      if (down('c')) reverse = true;
    }

    // Virtual on-screen stick when physical sticks / keys left drive at rest
    if (Math.abs(left) < 1e-6 && Math.abs(right) < 1e-6) {
      const vx = this._virtLx;
      const vy = -this._virtLy; // browser stickY up=-1 → positive throttle like pad path
      if (Math.abs(vx) > 1e-6 || Math.abs(vy) > 1e-6) {
        if (this.arcade) {
          left = vy + vx;
          right = vy - vx;
        } else {
          left = vy;
          right = vy;
        }
      }
    }
    if (this._virtShoot) {
      cmd.flywheel = true;
      if (!this._prevVirtShoot) cmd.shoot = true;
    }
    this._prevVirtShoot = this._virtShoot;

    if (this._virtIntake && !this._prevVirtIntake) this.intakeOn = !this.intakeOn;
    this._prevVirtIntake = this._virtIntake;

    const m = Math.max(Math.abs(left), Math.abs(right), 1);
    cmd.left = left / m;
    cmd.right = right / m;
    cmd.intake = reverse ? -1 : this.intakeOn ? 1 : 0;
    return cmd;
  }
}

function axis(pad, i) {
  return i < pad.axes.length ? pad.axes[i] : 0;
}
