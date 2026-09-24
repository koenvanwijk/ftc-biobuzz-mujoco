/**
 * CRServo = continuous rotation = velocity device (power -1..1), GEEN positie.
 */
export class CRServoBridge {
  constructor(jsId, { publishCommand }) {
    this.jsId = jsId;
    this._publish = publishCommand;
    this._power = 0;
    this._direction = 'FORWARD';
    this._pwm = true;
    this._emit();
  }

  _dirSign() {
    return this._direction === 'REVERSE' ? -1 : 1;
  }

  _emit() {
    this._publish({
      type: 'crServo',
      jsId: this.jsId,
      power: this._pwm ? this._power * this._dirSign() : 0,
      pwm: this._pwm,
    });
  }

  setPower(p) {
    this._power = Math.min(1, Math.max(-1, Number(p)));
    this._emit();
  }

  getPower() {
    return this._power;
  }

  setDirection(d) {
    this._direction = String(d);
    this._emit();
  }

  getDirection() {
    return this._direction;
  }

  setPwmEnable() {
    this._pwm = true;
    this._emit();
  }

  setPwmDisable() {
    this._pwm = false;
    this._emit();
  }

  isPwmEnabled() {
    return this._pwm;
  }

  zero() {
    this._power = 0;
    this._emit();
  }
}
