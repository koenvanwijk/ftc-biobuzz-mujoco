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

const BIOBUZZ_CELL_OPEN_DEPTH_M = 0.305;

const BIOBUZZ_CLUSTER_SPECS = [
  {
    key: 'red_scoring',
    name: 'RED SCORING',
    shortName: 'RS',
    ids: [30, 31, 32, 33],
    bodyName: 'red_scoring_shell',
    openSign: 1,
  },
  {
    key: 'red_audience',
    name: 'RED AUDIENCE',
    shortName: 'RA',
    ids: [34, 35, 36, 37],
    bodyName: 'red_audience_shell',
    openSign: -1,
  },
  {
    key: 'blue_audience',
    name: 'BLUE AUDIENCE',
    shortName: 'BA',
    ids: [38, 39, 40, 41],
    bodyName: 'blue_audience_shell',
    openSign: -1,
  },
  {
    key: 'blue_scoring',
    name: 'BLUE SCORING',
    shortName: 'BS',
    ids: [42, 43, 44, 45],
    bodyName: 'blue_scoring_shell',
    openSign: 1,
  },
];

const BIOBUZZ_CLUSTER_BY_ID = new Map();
for (const spec of BIOBUZZ_CLUSTER_SPECS) {
  for (const id of spec.ids) BIOBUZZ_CLUSTER_BY_ID.set(id, spec);
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scale3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function cameraCoords(v, camera) {
  return [
    dot3(v, camera.right),
    dot3(v, camera.forward),
    dot3(v, camera.up),
  ];
}

function clampUnit(v) {
  return Math.max(-1, Math.min(1, v));
}

/**
 * FTC orientation uses intrinsic Z-X-Y rotations:
 * yaw about camera +Z (up), then pitch about moved +X (right),
 * then roll about moved +Y (forward).
 *
 * targetAxes is a right-handed target frame whose zero-orientation axes are:
 *   right = camera +X, away = camera +Y, up = camera +Z.
 */
function ftcOrientationFromWorldAxes(targetAxes, camera) {
  if (!targetAxes) return { yaw: 0, pitch: 0, roll: 0 };

  const tx = cameraCoords(targetAxes.right, camera);
  const ty = cameraCoords(targetAxes.away, camera);
  const tz = cameraCoords(targetAxes.up, camera);

  // R = Rz(yaw) * Rx(pitch) * Ry(roll), columns are target axes
  // expressed in the FTC camera frame.
  const r01 = ty[0];
  const r11 = ty[1];
  const r21 = ty[2];
  const r20 = tx[2];
  const r22 = tz[2];

  const pitchRad = Math.asin(clampUnit(r21));
  const yawRad = Math.atan2(-r01, r11);
  const rollRad = Math.atan2(-r20, r22);

  return {
    yaw: yawRad * RAD2DEG,
    pitch: pitchRad * RAD2DEG,
    roll: rollRad * RAD2DEG,
  };
}

function matrixColumn(m, offset, column) {
  return [m[offset + column], m[offset + 3 + column], m[offset + 6 + column]];
}

function quaternionFromAxes(xAxis, yAxis, zAxis) {
  // Rotation matrix with the supplied world-space basis vectors as columns.
  const m00 = xAxis[0], m01 = yAxis[0], m02 = zAxis[0];
  const m10 = xAxis[1], m11 = yAxis[1], m12 = zAxis[1];
  const m20 = xAxis[2], m21 = yAxis[2], m22 = zAxis[2];
  const trace = m00 + m11 + m22;
  let w, x, y, z;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }

  const norm = Math.hypot(w, x, y, z) || 1;
  return { w: w / norm, x: x / norm, y: y / norm, z: z / norm };
}

function averagePoints(points) {
  if (!points.length) return [0, 0, 0];
  const sum = points.reduce(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

function clusterTargetFromBody(mujoco, model, data, spec, fallbackPoints) {
  const BODY = mujoco.mjtObj?.mjOBJ_BODY?.value;
  if (BODY != null && data.xpos && data.xmat) {
    const bodyId = mujoco.mj_name2id(model, BODY, spec.bodyName);
    if (bodyId >= 0) {
      const bo = bodyId * 3;
      const bm = bodyId * 9;
      const bodyPos = [data.xpos[bo], data.xpos[bo + 1], data.xpos[bo + 2]];
      const localX = matrixColumn(data.xmat, bm, 0);
      const localY = matrixColumn(data.xmat, bm, 1);
      const localZ = matrixColumn(data.xmat, bm, 2);
      const openingOffset = spec.openSign * (BIOBUZZ_CELL_OPEN_DEPTH_M / 2);
      const clusterY = [
        localY[0] * spec.openSign,
        localY[1] * spec.openSign,
        localY[2] * spec.openSign,
      ];
      const clusterZ = [
        localZ[0] * spec.openSign,
        localZ[1] * spec.openSign,
        localZ[2] * spec.openSign,
      ];
      return {
        position: [
          bodyPos[0] + localY[0] * openingOffset,
          bodyPos[1] + localY[1] * openingOffset,
          bodyPos[2] + localY[2] * openingOffset,
        ],
        // The two CELL openings face opposite local-Y directions. Flip both Y/Z
        // to keep a proper right-handed cluster frame while preserving the SDK
        // roll discriminator between scorable and non-scorable CELLs.
        targetAxes: {
          right: localX,
          away: clusterY,
          up: clusterZ,
        },
        fieldOrientation: quaternionFromAxes(localX, clusterY, clusterZ),
      };
    }
  }

  // The real BIOBUZZ world has the *_shell bodies. Keep a graceful fallback for
  // synthetic/unit-test worlds that only define tag sites.
  return {
    position: averagePoints(fallbackPoints),
    targetAxes: null,
    fieldOrientation: { w: 1, x: 0, y: 0, z: 0 },
  };
}

function poseFromWorldTarget(point, camera, targetAxes = null) {
  const delta = [
    point[0] - camera.pos[0],
    point[1] - camera.pos[1],
    point[2] - camera.pos[2],
  ];

  // FTC camera frame: +X right, +Y out of the lens, +Z up.
  const x = dot3(delta, camera.right);
  const y = dot3(delta, camera.forward);
  const z = dot3(delta, camera.up);
  const orientation = ftcOrientationFromWorldAxes(targetAxes, camera);

  // Match the FTC SDK formulas: range is planar X/Y range, bearing positive
  // counter-clockwise (target left), elevation positive upward.
  const range = Math.hypot(x, y);
  const bearing = Math.atan2(-x, y) * RAD2DEG;
  const elevation = Math.atan2(z, y) * RAD2DEG;

  return {
    x,
    y,
    z,
    ...orientation,
    range,
    bearing,
    elevation,
  };
}

function rawPoseFromFtcPose(pose) {
  // SDK conversion: ftc.x=raw.x, ftc.y=raw.z, ftc.z=-raw.y.
  return { x: pose.x, y: -pose.z, z: pose.y };
}

function makeSingleDetection(id, tagPos, pose, facing) {
  return {
    id,
    metadata: { id, name: 'Tag' + id, tagsize: 0.08255, distanceUnit: 'METER' },
    isSingleDetection: true,
    isClusterDetection: false,
    ftcPose: pose,
    rawPose: rawPoseFromFtcPose(pose),
    robotPose: null,
    hamming: 0,
    decisionMargin: Math.min(100, facing * 100),
    center: { x: 0, y: 0 },
  };
}

/**
 * Synthetic AprilTag detections from sites apriltag_N relative to a camera site.
 *
 * FTC SDK 12 semantics are modeled for BIOBUZZ:
 *  - IDs 30..45 belong to four 4-tag CELL clusters.
 *  - one visible member is enough to return one cluster detection;
 *  - cluster members are never returned as AprilTagSingleDetection;
 *  - percentClusterFound is 25/50/75/100;
 *  - cluster pose origin is the center of the CELL opening and follows HIVE tip.
 *
 * FTC ftcPose (meters / degrees): X=right, Y=forward, Z=up in the camera frame.
 * Pitch/roll/yaw are target orientation about X/Y/Z; bearing/elevation are
 * position-derived pointing angles, matching the FTC SDK formulas.
 * Visibility:
 *  - in front of camera (FTC y > 0)
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
  const axisX = matrixColumn(xmat, cm, 0);
  const axisY = matrixColumn(xmat, cm, 1);
  const axisZ = matrixColumn(xmat, cm, 2);
  // MuJoCo camera looks along local -Z. Convert to the FTC camera frame:
  // +X right, +Y forward (out of lens), +Z up.
  const camera = {
    pos: camPos,
    right: axisX,
    forward: [-axisZ[0], -axisZ[1], -axisZ[2]],
    up: axisY,
  };

  const halfFov = ((fovyDeg / 2) * Math.PI) / 180;
  const cosHalfFov = Math.cos(halfFov);

  const singleDetections = [];
  const visibleClusterMembers = new Map();

  for (const id of ids) {
    const siteName = 'apriltag_' + id;
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

    const forward =
      dx * camera.forward[0] + dy * camera.forward[1] + dz * camera.forward[2];
    if (forward <= 1e-4) continue;

    // FOV cone: angle from optical axis must be <= fovy/2.
    if (forward / range < cosHalfFov) continue;

    // Tag local Z from site_xmat. Hive underside tags may expose either matrix
    // normal depending on mesh/site convention, so accept the stronger face.
    const tZ = matrixColumn(xmat, sm, 2);
    const toCam = [-dx / range, -dy / range, -dz / range];
    const facePlus = dot3(tZ, toCam);
    const facing = Math.max(facePlus, -facePlus);
    if (facing < minFacingDot) continue;

    const clusterSpec = BIOBUZZ_CLUSTER_BY_ID.get(id);
    if (clusterSpec) {
      const members = visibleClusterMembers.get(clusterSpec.key) || [];
      members.push({ id, position: tagPos, facing });
      visibleClusterMembers.set(clusterSpec.key, members);
      continue;
    }

    const tX = matrixColumn(xmat, sm, 0);
    const tY = matrixColumn(xmat, sm, 1);
    // The scene's visible printed face may be represented by either site ±Z.
    // Pick the side facing the camera, and flip X with it so the resulting
    // target frame remains right-handed while preserving printed "up".
    const faceSign = facePlus >= 0 ? 1 : -1;
    const targetAxes = {
      right: scale3(tX, faceSign),
      away: scale3(tZ, -faceSign),
      up: tY,
    };
    const pose = poseFromWorldTarget(tagPos, camera, targetAxes);
    singleDetections.push(makeSingleDetection(id, tagPos, pose, facing));
  }

  const clusterDetections = [];
  for (const spec of BIOBUZZ_CLUSTER_SPECS) {
    const members = visibleClusterMembers.get(spec.key) || [];
    if (!members.length) continue;

    const target = clusterTargetFromBody(
      mujoco,
      model,
      data,
      spec,
      members.map((m) => m.position),
    );
    const pose = poseFromWorldTarget(target.position, camera, target.targetAxes);

    clusterDetections.push({
      metadata: {
        name: spec.name,
        shortName: spec.shortName,
        distanceUnit: 'METER',
        fieldPosition: [...target.position],
        fieldOrientation: target.fieldOrientation,
      },
      percentClusterFound: Math.round((members.length * 100) / spec.ids.length),
      isSingleDetection: false,
      isClusterDetection: true,
      ftcPose: pose,
      rawPose: rawPoseFromFtcPose(pose),
      robotPose: null,
    });
  }

  const detections = [...clusterDetections, ...singleDetections];
  detections.sort((a, b) => a.ftcPose.range - b.ftcPose.range);
  return { detections, json: JSON.stringify(detections) };
}

