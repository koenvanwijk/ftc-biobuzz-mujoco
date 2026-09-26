import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAprilTagDetections } from '../../src/mujoco/simSensors.js';

const DEG = Math.PI / 180;

// Camera at origin, looking +world X.
// FTC camera axes: +X right = -world Y, +Y forward = +world X, +Z up = +world Z.
// MuJoCo site local +Z points backward, so camera site matrix columns are
// right, up, backward.
const CAM_MAT = [
  0, 0, -1,
  -1, 0, 0,
  0, 1, 0,
];

function mul3(A, B) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) out[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
    }
  }
  return out;
}

function rz(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
function rx(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
function ry(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function cameraToWorld(v) {
  // world = right*x + forward*y + up*z
  return [v[1], -v[0], v[2]];
}

function siteMatrixForFtcOrientation(yawDeg = 0, pitchDeg = 0, rollDeg = 0) {
  const R = mul3(
    mul3(rz(yawDeg * DEG), rx(pitchDeg * DEG)),
    ry(rollDeg * DEG),
  );

  // Columns of R are target right, target away, target up in FTC camera coords.
  const rightCam = [R[0], R[3], R[6]];
  const awayCam = [R[1], R[4], R[7]];
  const upCam = [R[2], R[5], R[8]];

  const tX = cameraToWorld(rightCam);
  const tY = cameraToWorld(upCam);
  const tZ = cameraToWorld(awayCam).map((v) => -v); // site +Z is printed-face normal

  // Row-major matrix from columns tX, tY, tZ.
  return [
    tX[0], tY[0], tZ[0],
    tX[1], tY[1], tZ[1],
    tX[2], tY[2], tZ[2],
  ];
}

function detect({
  ftcPosition = [0, 2, 0],
  yaw = 0,
  pitch = 0,
  roll = 0,
} = {}) {
  const siteNames = ['robot_up_cam', 'apriltag_50'];
  const siteIds = new Map(siteNames.map((name, i) => [name, i]));

  const site_xpos = new Float64Array(6);
  const site_xmat = new Float64Array(18);
  site_xmat.set(CAM_MAT, 0);
  site_xmat.set(siteMatrixForFtcOrientation(yaw, pitch, roll), 9);

  // world = right*x + forward*y + up*z = [y, -x, z]
  site_xpos[3] = ftcPosition[1];
  site_xpos[4] = -ftcPosition[0];
  site_xpos[5] = ftcPosition[2];

  const mujoco = {
    mjtObj: { mjOBJ_SITE: { value: 1 } },
    mj_name2id: (_model, _type, name) => siteIds.get(name) ?? -1,
  };

  const result = computeAprilTagDetections(
    mujoco,
    {},
    { site_xpos, site_xmat },
    {
      tagIds: [50],
      maxRangeM: 5,
      fovyDeg: 120,
      minFacingDot: 0.5,
    },
  );
  assert.equal(result.detections.length, 1);
  return result.detections[0];
}

function near(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
}

describe('FTC SDK AprilTag pose semantics', () => {
  it('uses X=right, Y=forward, Z=up and SDK RBE formulas', () => {
    const det = detect({ ftcPosition: [-0.5, 2.0, 0.4] });

    near(det.ftcPose.x, -0.5);
    near(det.ftcPose.y, 2.0);
    near(det.ftcPose.z, 0.4);
    near(det.ftcPose.range, Math.hypot(-0.5, 2.0));
    near(det.ftcPose.bearing, Math.atan2(0.5, 2.0) / DEG);
    near(det.ftcPose.elevation, Math.atan2(0.4, 2.0) / DEG);

    // A face-on target can have non-zero bearing without any yaw.
    near(det.ftcPose.yaw, 0);
    assert.ok(Math.abs(det.ftcPose.bearing) > 1);
  });

  it('keeps yaw independent from bearing', () => {
    const det = detect({ ftcPosition: [0, 2, 0], yaw: 20 });
    near(det.ftcPose.bearing, 0);
    near(det.ftcPose.yaw, 20);
    near(det.ftcPose.pitch, 0);
    near(det.ftcPose.roll, 0);
  });

  it('reports pitch about camera X and roll about camera Y', () => {
    const det = detect({ ftcPosition: [0, 2, 0], pitch: -15, roll: 30 });
    near(det.ftcPose.pitch, -15);
    near(det.ftcPose.roll, 30);
    near(det.ftcPose.yaw, 0);
  });

  it('maps rawPose translation exactly like the FTC SDK', () => {
    const det = detect({ ftcPosition: [0.25, 1.5, -0.2] });
    near(det.rawPose.x, 0.25);
    near(det.rawPose.y, 0.2);
    near(det.rawPose.z, 1.5);
  });
});
