/**
 * Shared IMU + synthetic AprilTag computation from MuJoCo state.
 * Simulated extensions — not real CV / calibrated IMU.
 */

const RAD2DEG = 180 / Math.PI;

/** MuJoCo quat (w,x,y,z) → yaw/pitch/roll (ZYX / aerospace), radians. */
export function quatToYawPitchRoll(qw, qx, qy, qz) {
  const sinr_cosp = 2 * (qw * qx + qy * qz);
  const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (qw * qy - qz * qx);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const siny_cosp = 2 * (qw * qz + qx * qy);
  const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return { yawRad: yaw, pitchRad: pitch, rollRad: roll };
}

/**
 * Read IMU from a free-joint body (xquat + freejoint angular qvel).
 * @returns {{ yawRad, pitchRad, rollRad, wx, wy, wz }}
 */
export function readImuFromBody(mujoco, model, data, bodyName, freeJointName) {
  const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
  const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
  const bodyId = mujoco.mj_name2id(model, BODY, bodyName);
  if (bodyId < 0) {
    return { yawRad: 0, pitchRad: 0, rollRad: 0, wx: 0, wy: 0, wz: 0 };
  }
  const o = bodyId * 4;
  const qw = data.xquat[o];
  const qx = data.xquat[o + 1];
  const qy = data.xquat[o + 2];
  const qz = data.xquat[o + 3];
  const ypr = quatToYawPitchRoll(qw, qx, qy, qz);

  let wx = 0;
  let wy = 0;
  let wz = 0;
  if (freeJointName) {
    const jntId = mujoco.mj_name2id(model, JNT, freeJointName);
    if (jntId >= 0) {
      const dof = model.jnt_dofadr[jntId];
      wx = data.qvel[dof + 3] || 0;
      wy = data.qvel[dof + 4] || 0;
      wz = data.qvel[dof + 5] || 0;
    }
  }
  return { ...ypr, wx, wy, wz };
}

/**
 * Synthetic AprilTag detections from sites apriltag_N relative to a camera site.
 *
 * Approx FTC ftcPose (meters / degrees): x=right, y=down, z=forward in camera frame.
 * Visibility:
 *  - in front of camera (z > 0)
 *  - within maxRangeM
 *  - inside vertical FOV cone (fovyDeg, default 70 — matches robot_up_cam)
 *  - tag printed face roughly toward camera (stricter facing dot)
 *
 * @returns {{ detections: object[], json: string }}
 */
export function computeAprilTagDetections(mujoco, model, data, opts = {}) {
  const {
    cameraSiteName = 'robot_up_cam',
    tagIds = null, // default 30..45
    maxRangeM = 2.5,
    minFacingDot = 0.55,
    fovyDeg = 70,
  } = opts;

  const SITE = mujoco.mjtObj.mjOBJ_SITE.value;
  const camId = mujoco.mj_name2id(model, SITE, cameraSiteName);
  if (camId < 0) {
    return { detections: [], json: '[]' };
  }

  const ids = tagIds || Array.from({ length: 16 }, (_, i) => 30 + i);

  const xpos = data.site_xpos;
  const xmat = data.site_xmat;
  const co = camId * 3;
  const cm = camId * 9;
  const camPos = [xpos[co], xpos[co + 1], xpos[co + 2]];
  // site_xmat row-major; local axes as columns: X=(r00,r10,r20), Y=(r01,r11,r21), Z=(r02,r12,r22)
  const axisX = [xmat[cm + 0], xmat[cm + 3], xmat[cm + 6]];
  const axisY = [xmat[cm + 1], xmat[cm + 4], xmat[cm + 7]];
  const axisZ = [xmat[cm + 2], xmat[cm + 5], xmat[cm + 8]];
  // MuJoCo camera looks along −Z; robot_up_cam is tilted upward.
  const look = [-axisZ[0], -axisZ[1], -axisZ[2]];
  const right = axisX;
  const down = [-axisY[0], -axisY[1], -axisY[2]];

  const halfFov = ((fovyDeg / 2) * Math.PI) / 180;
  const cosHalfFov = Math.cos(halfFov);

  const detections = [];
  for (const id of ids) {
    const siteName = `apriltag_${id}`;
    const sid = mujoco.mj_name2id(model, SITE, siteName);
    if (sid < 0) continue;

    const so = sid * 3;
    const sm = sid * 9;
    const tagPos = [xpos[so], xpos[so + 1], xpos[so + 2]];
    const dx = tagPos[0] - camPos[0];
    const dy = tagPos[1] - camPos[1];
    const dz = tagPos[2] - camPos[2];
    const range = Math.hypot(dx, dy, dz);
    if (range < 1e-4 || range > maxRangeM) continue;

    const x = dx * right[0] + dy * right[1] + dz * right[2];
    const y = dx * down[0] + dy * down[1] + dz * down[2];
    const z = dx * look[0] + dy * look[1] + dz * look[2];
    if (z <= 1e-4) continue;

    // FOV cone: angle from look axis must be ≤ fovy/2
    // cos(theta) = z/range; require cos(theta) ≥ cos(halfFov)
    if (z / range < cosHalfFov) continue;

    // Tag local Z from site_xmat. Hive underside tags: printed face is typically −Z
    // (toward the field / robot). Require that best face-toward-camera exceeds threshold.
    const tZ = [xmat[sm + 2], xmat[sm + 5], xmat[sm + 8]];
    const toCam = [-dx / range, -dy / range, -dz / range];
    const facePlus = tZ[0] * toCam[0] + tZ[1] * toCam[1] + tZ[2] * toCam[2];
    const faceMinus = -facePlus;
    // Prefer the printed (−Z) face for BIOBUZZ underside tags, but allow +Z if stronger.
    const facing = Math.max(facePlus, faceMinus);
    if (facing < minFacingDot) continue;

    const yaw = Math.atan2(x, z) * RAD2DEG;
    const pitch = Math.atan2(-y, Math.hypot(x, z)) * RAD2DEG;

    detections.push({
      id,
      metadata: { id, name: `Tag${id}`, tagsize: 0.08255 },
      isSingleDetection: true,
      isClusterDetection: false,
      ftcPose: {
        x,
        y,
        z,
        yaw,
        pitch,
        roll: 0,
        range,
        bearing: yaw,
        elevation: -pitch,
      },
      rawPose: { x, y, z },
      robotPose: {
        position: { x: tagPos[0], y: tagPos[1], z: tagPos[2] },
        orientation: { pitch: 0, roll: 0, yaw: 0 },
      },
      hamming: 0,
      decisionMargin: Math.min(100, facing * 100),
      center: { x: 0, y: 0 },
    });
  }

  // Nearest-first (stable telemetry)
  detections.sort((a, b) => a.ftcPose.range - b.ftcPose.range);

  return { detections, json: JSON.stringify(detections) };
}
