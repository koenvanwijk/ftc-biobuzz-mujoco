/**
 * Shared IMU + synthetic AprilTag / color-blob computation from MuJoCo state.
 * Simulated extensions — not real CV / calibrated IMU.
 */
import {
  DEFAULT_ROBOT_CAMERA_FOV,
  isInRectFrustum,
  normalizeResolution,
  resolveFovOpts,
} from './robotCamera.js';

const RAD2DEG = 180 / Math.PI;

/**
 * Project the yellow BIOBUZZ pollen bodies into the synthetic robot-camera frame.
 * Uses the same camera as the AprilTag detection: same site (robot_up_cam, so the same
 * mount height/pitch), same rectangular frustum (hfovDeg × vfovDeg from the Brio 4K preset,
 * see robotCamera.js) and the stream resolution (width × height, default 640×480).
 * A pollen counts when its projected circle overlaps the image (edge blobs are clipped,
 * as a real blob detector would see a partial ball).
 * The result mirrors the JSON fields exposed by FTC ColorBlobLocatorProcessor.Blob.
 *
 * @param {object} opts  { cameraSiteName, hfovDeg, vfovDeg, width, height, maxRangeM, pollenRadiusM }
 *   Legacy `fovyDeg` alone still works (hfov derived from the image aspect).
 */
export function computePollenColorBlobs(mujoco, model, data, opts = {}) {
  const {
    cameraSiteName = 'robot_up_cam',
    maxRangeM = 3.5,
    pollenRadiusM = 0.03556,
  } = opts;
  const res = normalizeResolution(opts.width, opts.height) || {
    width: DEFAULT_ROBOT_CAMERA_FOV.width,
    height: DEFAULT_ROBOT_CAMERA_FOV.height,
  };
  const { width, height } = res;
  const { hfovDeg, vfovDeg } = resolveFovOpts({
    ...opts,
    aspect: Number(opts.aspect) > 0 ? Number(opts.aspect) : width / height,
  });
  const SITE = mujoco.mjtObj.mjOBJ_SITE.value;
  const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
  const camId = mujoco.mj_name2id(model, SITE, cameraSiteName);
  if (camId < 0) return { blobs: [], json: '[]', width, height };

  const co = camId * 3;
  const cm = camId * 9;
  const camPos = [data.site_xpos[co], data.site_xpos[co + 1], data.site_xpos[co + 2]];
  const right = matrixColumn(data.site_xmat, cm, 0);
  const up = matrixColumn(data.site_xmat, cm, 1);
  const z = matrixColumn(data.site_xmat, cm, 2);
  const forwardAxis = [-z[0], -z[1], -z[2]];
  // Pinhole intrinsics from the rectangular frustum: the image edges are exactly ±hfov/2, ±vfov/2.
  const fx = width / (2 * Math.tan((hfovDeg * Math.PI) / 360));
  const fy = height / (2 * Math.tan((vfovDeg * Math.PI) / 360));
  const blobs = [];

  for (let bid = 0; bid < model.nbody; bid++) {
    const name = mujoco.mj_id2name(model, BODY, bid);
    if (!name || !/^pollen_\d+$/.test(name)) continue;
    const bo = bid * 3;
    const d = [
      data.xpos[bo] - camPos[0],
      data.xpos[bo + 1] - camPos[1],
      data.xpos[bo + 2] - camPos[2],
    ];
    const forward = dot3(d, forwardAxis);
    if (forward <= pollenRadiusM || forward > maxRangeM) continue;
    const cx = width / 2 + (fx * dot3(d, right)) / forward;
    const cy = height / 2 - (fy * dot3(d, up)) / forward;
    const radius = Math.max(1, (Math.sqrt(fx * fy) * pollenRadiusM) / forward);
    if (cx + radius < 0 || cx - radius > width || cy + radius < 0 || cy - radius > height) continue;

    const left = Math.max(0, cx - radius);
    const rightPx = Math.min(width, cx + radius);
    const top = Math.max(0, cy - radius);
    const bottom = Math.min(height, cy + radius);
    const clippedRadius = Math.min(radius, (rightPx - left) / 2, (bottom - top) / 2);
    const area = Math.max(1, Math.round(Math.PI * clippedRadius * clippedRadius));
    const circumference = 2 * Math.PI * clippedRadius;
    const points = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI * 2) / 16;
      return { x: cx + clippedRadius * Math.cos(a), y: cy + clippedRadius * Math.sin(a) };
    });
    blobs.push({
      ContourArea: area,
      Density: 1,
      AspectRatio: 1,
      ArcLength: circumference,
      Circularity: 1,
      ContourPoints: points,
      // Property names follow the FTC Blocks generators: RotatedRect uses center/size/angle/boundingRect/points,
      // Circle uses X/Y/Radius/Center (circle_getProperty_* emits `circle.X`, `circle.Center`, ...).
      BoxFit: {
        center: { x: cx, y: cy },
        size: { width: 2 * clippedRadius, height: 2 * clippedRadius },
        angle: 0,
        boundingRect: {
          x: Math.floor(cx - clippedRadius), y: Math.floor(cy - clippedRadius),
          width: Math.ceil(2 * clippedRadius), height: Math.ceil(2 * clippedRadius),
        },
        points: [
          { x: cx - clippedRadius, y: cy + clippedRadius }, { x: cx - clippedRadius, y: cy - clippedRadius },
          { x: cx + clippedRadius, y: cy - clippedRadius }, { x: cx + clippedRadius, y: cy + clippedRadius },
        ],
      },
      Circle: { X: cx, Y: cy, Radius: clippedRadius, Center: { x: cx, y: cy } },
    });
  }
  blobs.sort((a, b) => b.ContourArea - a.ContourArea);
  return { blobs, json: JSON.stringify(blobs), width, height };
}

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
 * FTC SDK 12.0 AprilTagGameDatabase.getBioBuzzTagLibrary(): member k (ID = first + k) sits at
 * positionInClusterPlane = (x_k, 7.1874, −5.622) in. The cluster plane frame is the AprilTag object
 * frame (+X right, +Y down as printed, +Z into the tag); its origin ≈ the CELL opening centre.
 */
const INCH_M = 0.0254;
export const BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M = [-6.5, -2.75, 2.75, 6.5].map((x) => [
  x * INCH_M,
  7.1874 * INCH_M,
  -5.622 * INCH_M,
]);

const BIOBUZZ_CLUSTER_SPECS = [
  { key: 'red_scoring', name: 'RED SCORING', shortName: 'RS', ids: [30, 31, 32, 33] },
  { key: 'red_audience', name: 'RED AUDIENCE', shortName: 'RA', ids: [34, 35, 36, 37] },
  { key: 'blue_audience', name: 'BLUE AUDIENCE', shortName: 'BA', ids: [38, 39, 40, 41] },
  { key: 'blue_scoring', name: 'BLUE SCORING', shortName: 'BS', ids: [42, 43, 44, 45] },
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

/**
 * Target frame of a single printed tag from its site (site +X = printed right, +Y = printed up,
 * +Z = out of the printed face). The visible face may be either site ±Z in synthetic worlds:
 * pick the side facing the camera and flip X with it so the frame stays right-handed.
 */
function tagTargetAxes(xmat, sm, facePlus) {
  const tX = matrixColumn(xmat, sm, 0);
  const tY = matrixColumn(xmat, sm, 1);
  const tZ = matrixColumn(xmat, sm, 2);
  const faceSign = facePlus >= 0 ? 1 : -1;
  return { right: scale3(tX, faceSign), away: scale3(tZ, -faceSign), up: tY };
}

/**
 * Cluster pose like the SDK's multi-tag solve: every visible member k gives
 * origin = p_k − R_c · m_k with R_c = [right, −up, away] (SDK cluster plane frame) and m_k the SDK
 * positionInClusterPlane; the result is averaged over the visible members.
 */
function clusterTargetFromMembers(spec, members) {
  const axes = members[0].axes;
  const down = scale3(axes.up, -1);
  const sum = [0, 0, 0];
  for (const m of members) {
    const k = spec.ids.indexOf(m.id);
    const [mx, my, mz] = BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M[k];
    for (let i = 0; i < 3; i++) {
      sum[i] += m.position[i] - (axes.right[i] * mx + down[i] * my + axes.away[i] * mz);
    }
  }
  const position = sum.map((v) => v / members.length);
  return {
    position,
    targetAxes: axes,
    fieldOrientation: quaternionFromAxes(axes.right, axes.away, axes.up),
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
 *  - cluster pose = SDK multi-tag solve: origin from the SDK member offsets
 *    (≈ CELL opening centre), orientation = the printed tags' frame; follows a HIVE tip.
 *
 * FTC ftcPose (meters / degrees): X=right, Y=forward, Z=up in the camera frame.
 * Pitch/roll/yaw are target orientation about X/Y/Z; bearing/elevation are
 * position-derived pointing angles, matching the FTC SDK formulas.
 * Visibility:
 *  - in front of camera (FTC y > 0)
 *  - within maxRangeM
 *  - inside the rectangular camera frustum: |horizontal angle| <= hfov/2 AND
 *    |vertical angle| <= vfov/2 (hfovDeg/vfovDeg; default Logitech Brio 4K 90°
 *    preset at 640x480 → ~66.3° x 52.2°, see robotCamera.js). Legacy `fovyDeg`
 *    alone still works (hfov derived for 4:3).
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
  } = opts;
  const { hfovDeg, vfovDeg } = resolveFovOpts(opts);

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

    // Rectangular frustum (camera frame X right, Y forward, Z up).
    const camX = dx * camera.right[0] + dy * camera.right[1] + dz * camera.right[2];
    const camZ = dx * camera.up[0] + dy * camera.up[1] + dz * camera.up[2];
    if (!isInRectFrustum(camX, forward, camZ, hfovDeg, vfovDeg)) continue;

    // Tag local Z from site_xmat. Hive underside tags may expose either matrix
    // normal depending on mesh/site convention, so accept the stronger face.
    const tZ = matrixColumn(xmat, sm, 2);
    const toCam = [-dx / range, -dy / range, -dz / range];
    const facePlus = dot3(tZ, toCam);
    const facing = Math.max(facePlus, -facePlus);
    if (facing < minFacingDot) continue;

    const targetAxes = tagTargetAxes(xmat, sm, facePlus);
    const clusterSpec = BIOBUZZ_CLUSTER_BY_ID.get(id);
    if (clusterSpec) {
      const members = visibleClusterMembers.get(clusterSpec.key) || [];
      members.push({ id, position: tagPos, facing, axes: targetAxes });
      visibleClusterMembers.set(clusterSpec.key, members);
      continue;
    }

    const pose = poseFromWorldTarget(tagPos, camera, targetAxes);
    singleDetections.push(makeSingleDetection(id, tagPos, pose, facing));
  }

  const clusterDetections = [];
  for (const spec of BIOBUZZ_CLUSTER_SPECS) {
    const members = visibleClusterMembers.get(spec.key) || [];
    if (!members.length) continue;

    const target = clusterTargetFromMembers(spec, members);
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
