/**
 * yawPitchRollAnglesAccess — matches Blocks generators:
 *   yawPitchRollAnglesAccess.getYaw(obj)
 *   yawPitchRollAnglesAccess.getYaw(obj, angleUnit)
 * Degrees by default; convert when AngleUnit is RADIANS.
 */

import { isRadians, RAD2DEG } from './imu.js';

function readRad(obj, keyRad, keyDeg) {
  if (!obj) return 0;
  if (typeof obj[keyRad] === 'number') return obj[keyRad];
  if (typeof obj[keyDeg] === 'number') return obj[keyDeg] / RAD2DEG;
  return 0;
}

function getAngle(obj, keyRad, keyDeg, angleUnit) {
  const rad = readRad(obj, keyRad, keyDeg);
  return isRadians(angleUnit) ? rad : rad * RAD2DEG;
}

export const yawPitchRollAnglesAccess = {
  getYaw(obj, angleUnit) {
    return getAngle(obj, 'yawRad', 'yaw', angleUnit || 'DEGREES');
  },
  getPitch(obj, angleUnit) {
    return getAngle(obj, 'pitchRad', 'pitch', angleUnit || 'DEGREES');
  },
  getRoll(obj, angleUnit) {
    return getAngle(obj, 'rollRad', 'roll', angleUnit || 'DEGREES');
  },
  create(angleUnit, yaw, pitch, roll) {
    const toRad = isRadians(angleUnit)
      ? (v) => Number(v) || 0
      : (v) => ((Number(v) || 0) * Math.PI) / 180;
    const yawRad = toRad(yaw);
    const pitchRad = toRad(pitch);
    const rollRad = toRad(roll);
    return {
      __type: 'YawPitchRollAngles',
      yawRad,
      pitchRad,
      rollRad,
      yaw: yawRad * RAD2DEG,
      pitch: pitchRad * RAD2DEG,
      roll: rollRad * RAD2DEG,
    };
  },
  toText(obj) {
    if (!obj) return 'null';
    return `YPR(y=${yawPitchRollAnglesAccess.getYaw(obj).toFixed(1)}, p=${yawPitchRollAnglesAccess.getPitch(obj).toFixed(1)}, r=${yawPitchRollAnglesAccess.getRoll(obj).toFixed(1)})`;
  },
};
