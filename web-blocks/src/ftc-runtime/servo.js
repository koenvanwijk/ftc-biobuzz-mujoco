/** Positionele Servo — setPosition 0..1, scaleRange, direction. */
export class ServoBridge {
  constructor(jsId, { publishCommand, initialPosition = 0.5 }) {
    this.jsId = jsId;
    this._publish = publishCommand;
    this._position = initialPosition;
    this._direction = 'FORWARD';
    this._min = 0;
    this._max = 1;
    this._pwm = true;
    this._emit();
  }

  _emit() {
    const dir = this._direction === 'REVERSE' ? 1 - this._position : this._position;
    const scaled = this._min + dir * (this._max - this._min);
    this._publish({
      type: 'servo',
      jsId: this.jsId,
      position01: clamp01(scaled),
      pwm: this._pwm,
    });
  }

  setPosition(p) {
    this._position = clamp01(Number(p));
    this._emit();
  }

  getPosition() {
    return this._position;
  }

  setDirection(d) {
    this._direction = String(d);
    this._emit();
  }

  getDirection() {
    return this._direction;
  }

  scaleRange(min, max) {
    this._min = Number(min);
    this._max = Number(max);
    this._emit();
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
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}
