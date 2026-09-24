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
        upAxis: clusterZ,
        fieldOrientation: quaternionFromAxes(localX, clusterY, clusterZ),
      };
    }
  }

  // The real BIOBUZZ world has the *_shell bodies. Keep a graceful fallback for
  // synthetic/unit-test worlds that only define tag sites.
  return {
    position: averagePoints(fallbackPoints),
    upAxis: null,
    fieldOrientation: { w: 1, x: 0, y: 0, z: 0 },
  };
}

function poseFromWorldPoint(point, camera) {
  const delta = [
    point[0] - camera.pos[0],
    point[1] - camera.pos[1],
    point[2] - camera.pos[2],
  ];
  const x = dot3(delta, camera.right);
  const y = dot3(delta, camera.down);
  const z = dot3(delta, camera.look);
  const range = Math.hypot(delta[0], delta[1], delta[2]);
  const yaw = Math.atan2(x, z) * RAD2DEG;
  const pitch = Math.atan2(-y, Math.hypot(x, z)) * RAD2DEG;

  let roll = 0;
  if (camera.upAxis) {
    const rightComponent = dot3(camera.upAxis, camera.right);
    const screenUpComponent = -dot3(camera.upAxis, camera.down);
    if (Math.hypot(rightComponent, screenUpComponent) > 1e-6) {
      roll = Math.atan2(rightComponent, screenUpComponent) * RAD2DEG;
    }
  }

  return {
    x,
    y,
    z,
    yaw,
    pitch,
    roll,
    range,
    bearing: yaw,
    elevation: -pitch,
  };
}

function makeSingleDetection(id, tagPos, pose, facing) {
  return {
    id,
    metadata: { id, name: 'Tag' + id, tagsize: 0.08255 },
    isSingleDetection: true,
    isClusterDetection: false,
    ftcPose: pose,
    rawPose: { x: pose.x, y: pose.y, z: pose.z },
    robotPose: {
      position: { x: tagPos[0], y: tagPos[1], z: tagPos[2] },
      orientation: { pitch: 0, roll: 0, yaw: 0 },
    },
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
  const axisX = matrixColumn(xmat, cm, 0);
  const axisY = matrixColumn(xmat, cm, 1);
  const axisZ = matrixColumn(xmat, cm, 2);
  // MuJoCo camera looks along -Z; robot_up_cam is tilted upward.
  const camera = {
    pos: camPos,
    look: [-axisZ[0], -axisZ[1], -axisZ[2]],
    right: axisX,
    down: [-axisY[0], -axisY[1], -axisY[2]],
    upAxis: null,
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

    const x = dx * camera.right[0] + dy * camera.right[1] + dz * camera.right[2];
    const y = dx * camera.down[0] + dy * camera.down[1] + dz * camera.down[2];
    const z = dx * camera.look[0] + dy * camera.look[1] + dz * camera.look[2];
    if (z <= 1e-4) continue;

    // FOV cone: angle from look axis must be <= fovy/2
    if (z / range < cosHalfFov) continue;

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

    const pose = poseFromWorldPoint(tagPos, camera);
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
    const clusterCamera = { ...camera, upAxis: target.upAxis };
    const pose = poseFromWorldPoint(target.position, clusterCamera);

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
      rawPose: { x: pose.x, y: pose.y, z: pose.z },
      robotPose: {
        position: {
          x: target.position[0],
          y: target.position[1],
          z: target.position[2],
        },
        orientation: { pitch: pose.pitch, roll: pose.roll, yaw: pose.yaw },
      },
    });
  }

  const detections = [...clusterDetections, ...singleDetections];
  detections.sort((a, b) => a.ftcPose.range - b.ftcPose.range);
  return { detections, json: JSON.stringify(detections) };
}

