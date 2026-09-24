/**
 * DcMotor / DcMotorEx-brug die exact overeenkomt met Blocks JS-generator:
 * setPower / getPower / setDirection / setMode / setDualPower / enz.
 *
 * Commando's gaan naar een command-bus; sensorwaarden komen uit sensor-state
 * (gevuld door MuJoCo-adapters op de physics-thread).
 */

const UNSUPPORTED = new Set([
  'setPIDFCoefficients',
  'getPIDFCoefficients',
  'setVelocityPIDFCoefficients',
  'setPositionPIDFCoefficients',
  'getCurrent',
  'getCurrentAlert',
  'setCurrentAlert',
  'isOverCurrent',
]);

export class DcMotorBridge {
  /**
   * @param {string} jsId
   * @param {object} opts
   * @param {(cmd: object) => void} opts.publishCommand
   * @param {() => object} opts.readSensor  returns { positionTicks, velocityTicksPerSec, busy }
   * @param {object} opts.limits { maxRadPerSec, ticksPerRad }
   */
  constructor(jsId, { publishCommand, readSensor, limits }) {
    this.jsId = jsId;
    this._publish = publishCommand;
    this._readSensor = readSensor;
    this._limits = limits || { maxRadPerSec: 31.4, ticksPerRad: 1 };

    this._power = 0;
    this._direction = 'FORWARD'; // FORWARD | REVERSE
    this._mode = 'RUN_WITHOUT_ENCODER';
    this._zpb = 'BRAKE'; // BRAKE | FLOAT
    this._targetPosition = 0;
    this._targetTolerance = 10;
    this._velocityTicksPerSec = 0; // for RUN_USING_ENCODER velocity mode (ticks/s)
    this._velocityMode = false;
    this._enabled = true;
    this._encoderOffsetTicks = 0;
  }

  _dirSign() {
    return this._direction === 'REVERSE' ? -1 : 1;
  }

  _emit() {
    this._publish({
      type: 'motor',
      jsId: this.jsId,
      power: this._enabled ? this._power * this._dirSign() : 0,
      mode: this._mode,
      zeroPowerBehavior: this._zpb,
      targetPosition: this._targetPosition,
      targetTolerance: this._targetTolerance,
      velocityTicksPerSec: this._velocityTicksPerSec * this._dirSign(),
      velocityMode: this._velocityMode,
      enabled: this._enabled,
      encoderOffsetTicks: this._encoderOffsetTicks,
    });
  }

  setPower(p) {
    this._power = clamp(Number(p), -1, 1);
    this._velocityMode = false;
    this._emit();
  }

  getPower() {
    return this._power;
  }

  setDualPower(p1, otherMotor, p2) {
    this.setPower(p1);
    if (otherMotor && typeof otherMotor.setPower === 'function') otherMotor.setPower(p2);
  }

  setDirection(dir) {
    this._direction = String(dir);
    this._emit();
  }

  getDirection() {
    return this._direction;
  }

  setZeroPowerBehavior(z) {
    this._zpb = String(z);
    this._emit();
  }

  getZeroPowerBehavior() {
    return this._zpb;
  }

  setMode(mode) {
    const m = String(mode);
    if (m === 'STOP_AND_RESET_ENCODER') {
      const s = this._readSensor();
      this._encoderOffsetTicks = s.positionTicks;
      this._power = 0;
      this._mode = 'RUN_WITHOUT_ENCODER';
      this._emit();
      return;
    }
    this._mode = m;
    this._emit();
  }

  getMode() {
    return this._mode;
  }

  setTargetPosition(ticks) {
    this._targetPosition = Math.round(Number(ticks));
    this._emit();
  }

  getTargetPosition() {
    return this._targetPosition;
  }

  setTargetPositionTolerance(t) {
    this._targetTolerance = Number(t);
    this._emit();
  }

  getTargetPositionTolerance() {
    return this._targetTolerance;
  }

  getCurrentPosition() {
    const s = this._readSensor();
    return Math.round((s.positionTicks - this._encoderOffsetTicks) * this._dirSign());
  }

  setVelocity(ticksPerSec) {
    this._velocityTicksPerSec = Number(ticksPerSec);
    this._velocityMode = true;
    this._emit();
  }

  getVelocity() {
    const s = this._readSensor();
    return s.velocityTicksPerSec * this._dirSign();
  }

  setVelocity_withAngleUnit(angularRate, angleUnit) {
    // Blocks uses setVelocity_withAngleUnit; map DEGREES/RADIANS → approx ticks/s via limits
    const unit = String(angleUnit || 'DEGREES');
    let radPerSec = Number(angularRate);
    if (unit === 'DEGREES') radPerSec *= Math.PI / 180;
    const ticksPerSec = radPerSec * this._limits.ticksPerRad;
    this.setVelocity(ticksPerSec);
  }

  getVelocity_withAngleUnit(angleUnit) {
    const ticks = this.getVelocity();
    const rad = ticks / this._limits.ticksPerRad;
    if (String(angleUnit) === 'DEGREES') return rad * 180 / Math.PI;
    return rad;
  }

  setDualVelocity(v1, other, v2) {
    this.setVelocity(v1);
    if (other?.setVelocity) other.setVelocity(v2);
  }

  setDualMode(m1, other, m2) {
    this.setMode(m1);
    if (other?.setMode) other.setMode(m2);
  }

  setDualTargetPosition(t1, other, t2) {
    this.setTargetPosition(t1);
    if (other?.setTargetPosition) other.setTargetPosition(t2);
  }

  setDualZeroPowerBehavior(z1, other, z2) {
    this.setZeroPowerBehavior(z1);
    if (other?.setZeroPowerBehavior) other.setZeroPowerBehavior(z2);
  }

  setDualDirection(d1, other, d2) {
    this.setDirection(d1);
    if (other?.setDirection) other.setDirection(d2);
  }

  /** Generieke setDualPROP voor generator: setDual + property-naam */
  setDual(prop, v1, other, v2) {
    const fn = this[`setDual${prop}`];
    if (typeof fn === 'function') return fn.call(this, v1, other, v2);
    // fallback: set on both
    this[`set${prop}`]?.(v1);
    other?.[`set${prop}`]?.(v2);
  }

  isBusy() {
    return !!this._readSensor().busy;
  }

  setMotorEnable() {
    this._enabled = true;
    this._emit();
  }

  setMotorDisable() {
    this._enabled = false;
    this._emit();
  }

  isMotorEnabled() {
    return this._enabled;
  }

  getMaxSpeed() {
    return this._limits.maxRadPerSec * this._limits.ticksPerRad;
  }

  setMaxSpeed() {
    /* legacy no-op in Java generator too for some paths */
  }

  getPowerFloat() {
    return this._zpb === 'FLOAT';
  }

  zero() {
    this._power = 0;
    this._velocityTicksPerSec = 0;
    this._velocityMode = false;
    this._emit();
  }

  /** Catch-all for unsupported advanced APIs */
  _unsupported(name) {
    throw new Error(
      `Niet ondersteund in simulator: ${this.jsId}.${name}() — geen volledige SDK/PIDF-emulatie.`,
    );
  }
}

/** Proxy zodat setDualPower / setPIDFCoefficients / getX werken zoals gegenereerd. */
export function wrapDcMotor(motor) {
  return new Proxy(motor, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (typeof prop === 'string') {
        if (UNSUPPORTED.has(prop)) {
          return () => target._unsupported(prop);
        }
        if (prop.startsWith('setDual')) {
          const p = prop.slice('setDual'.length);
          return (v1, other, v2) => target.setDual(p, v1, other, v2);
        }
      }
      return undefined;
    },
  });
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
