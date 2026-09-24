/**
 * Simulated IMU bridge — identifiers match FTC Blocks generators (`imuAsIMU`).
 * Reads sensor snapshot key `imuAsIMU`: { yawRad, pitchRad, rollRad, wx, wy, wz }.
 * Angles exposed to blocks are degrees by default (FTC convention).
 */

const RAD2DEG = 180 / Math.PI;

function isRadians(angleUnit) {
  const u = String(angleUnit || 'DEGREES').toUpperCase();
  return u === 'RADIANS' || u === 'RADIAN';
}

function convertAngle(rad, angleUnit) {
  return isRadians(angleUnit) ? rad : rad * RAD2DEG;
}

export class ImuBridge {
  /**
   * @param {string} jsId
   * @param {{ readSensor: () => object }} opts
   */
  constructor(jsId, opts) {
    this.jsId = jsId;
    this._readSensor = opts.readSensor;
    this._yawOffsetRad = 0;
    this._initialized = false;
  }

  initialize(_params) {
    this._initialized = true;
    return true;
  }

  _raw() {
    const s = this._readSensor() || {};
    return {
      yawRad: Number(s.yawRad) || 0,
      pitchRad: Number(s.pitchRad) || 0,
      rollRad: Number(s.rollRad) || 0,
      wx: Number(s.wx) || 0,
      wy: Number(s.wy) || 0,
      wz: Number(s.wz) || 0,
    };
  }

  /** Yaw after resetYaw offset, radians (internal). */
  _yawRad() {
    return this._raw().yawRad - this._yawOffsetRad;
  }

  /**
   * Used by imu_getProperty_YawPitchRollAngles → identifier.getRobotYawPitchRollAngles()
   * and by yawPitchRollAnglesAccess getters.
   */
  getRobotYawPitchRollAngles() {
    const r = this._raw();
    return {
      __type: 'YawPitchRollAngles',
      yawRad: this._yawRad(),
      pitchRad: r.pitchRad,
      rollRad: r.rollRad,
      yaw: this._yawRad() * RAD2DEG,
      pitch: r.pitchRad * RAD2DEG,
      roll: r.rollRad * RAD2DEG,
    };
  }

  /**
   * Simplified orientation — returns yaw/pitch/roll object compatible with basic use.
   * Full AxesOrder/AxesReference mapping is approximated (simulated extension).
   */
  getRobotOrientation(_axesReference, _axesOrder, angleUnit) {
    const r = this._raw();
    return {
      __type: 'Orientation',
      firstAngle: convertAngle(this._yawRad(), angleUnit),
      secondAngle: convertAngle(r.pitchRad, angleUnit),
      thirdAngle: convertAngle(r.rollRad, angleUnit),
      heading: convertAngle(this._yawRad(), angleUnit),
      yaw: convertAngle(this._yawRad(), angleUnit),
      pitch: convertAngle(r.pitchRad, angleUnit),
      roll: convertAngle(r.rollRad, angleUnit),
    };
  }

  getRobotAngularVelocity(angleUnit) {
    const r = this._raw();
    const k = isRadians(angleUnit) ? 1 : RAD2DEG;
    return {
      __type: 'AngularVelocity',
      x: (r.wx || 0) * k,
      y: (r.wy || 0) * k,
      z: (r.wz || 0) * k,
      xRotationRate: (r.wx || 0) * k,
      yRotationRate: (r.wy || 0) * k,
      zRotationRate: (r.wz || 0) * k,
    };
  }

  getRobotOrientationAsQuaternion() {
    const r = this._raw();
    const yaw = this._yawRad();
    const pitch = r.pitchRad;
    const roll = r.rollRad;
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);
    return {
      __type: 'Quaternion',
      w: cr * cp * cy + sr * sp * sy,
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy,
    };
  }

  getQuaternion() {
    return this.getRobotOrientationAsQuaternion();
  }

  resetYaw() {
    this._yawOffsetRad = this._raw().yawRad;
  }
}

/**
 * Create imuAsIMU object with methods matching Blocks generators
 * (`get` + PROP → getRobotYawPitchRollAngles).
 */
export function createImuAsIMU(readSensor) {
  const bridge = new ImuBridge('imuAsIMU', { readSensor });
  return {
    initialize: (p) => bridge.initialize(p),
    getRobotYawPitchRollAngles: () => bridge.getRobotYawPitchRollAngles(),
    getRobotOrientation: (a, b, c) => bridge.getRobotOrientation(a, b, c),
    getRobotAngularVelocity: (u) => bridge.getRobotAngularVelocity(u),
    getRobotOrientationAsQuaternion: () => bridge.getRobotOrientationAsQuaternion(),
    getQuaternion: () => bridge.getQuaternion(),
    resetYaw: () => bridge.resetYaw(),
    /** @internal test access */
    _bridge: bridge,
  };
}

export { RAD2DEG, isRadians, convertAngle };
