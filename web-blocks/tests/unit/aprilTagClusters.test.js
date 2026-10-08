import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAprilTagDetections, BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M } from '../../src/mujoco/simSensors.js';
import { DEFAULT_ROBOT_CAMERA_FOV } from '../../src/mujoco/robotCamera.js';

// Synthetische wereld: camera in de oorsprong kijkt langs +X (rechts = −Y, omhoog = +Z).
// Een cluster staat met zijn SDK-oorsprong (≈ midden CELL-opening) op O = (1, 0, 0).
// Tag-site-frame (zoals scene.py): +X = rechts zoals gedrukt (r), +Y = boven zoals gedrukt (u,
// richting de CELL-opening), +Z = uit het tagvlak (n, naar de camera).
// SDK 12 getBioBuzzTagLibrary(): lid k staat op positionInClusterPlane m_k in het clustervlak-frame
// [r, −u, −n] (X rechts, Y omlaag, Z het vlak in) → p_k = O + r·m_k.x − u·m_k.y − n·m_k.z.
const CAM_MAT = [0, 0, -1, -1, 0, 0, 0, 1, 0];
const ORIGIN = [1, 0, 0];

function frame(upright) {
  const n = [-1, 0, 0];
  const u = upright ? [0, 0, 1] : [0, 0, -1];
  const r = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]]; // r = u × n
  return { r, u, n };
}

function makeWorld(upright = true, singlePos = [1, 0.3, 0]) {
  const siteNames = ['robot_up_cam', 'apriltag_30', 'apriltag_31', 'apriltag_32', 'apriltag_33', 'apriltag_50'];
  const siteIds = new Map(siteNames.map((name, i) => [name, i]));
  const site_xpos = new Float64Array(siteNames.length * 3);
  const site_xmat = new Float64Array(siteNames.length * 9);
  site_xmat.set(CAM_MAT, 0);
  const { r, u, n } = frame(upright);
  const mat = [r[0], u[0], n[0], r[1], u[1], n[1], r[2], u[2], n[2]]; // kolommen r, u, n (rij-major)
  for (let k = 0; k < 4; k++) {
    const [mx, my, mz] = BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M[k];
    for (let i = 0; i < 3; i++) site_xpos[(k + 1) * 3 + i] = ORIGIN[i] + r[i] * mx - u[i] * my - n[i] * mz;
    site_xmat.set(mat, (k + 1) * 9);
  }
  site_xpos.set(singlePos, 5 * 3);
  site_xmat.set(mat, 5 * 9);
  const mujoco = {
    mjtObj: { mjOBJ_SITE: { value: 1 }, mjOBJ_BODY: { value: 2 } },
    mj_name2id: (_model, type, name) => (type === 1 ? siteIds.get(name) ?? -1 : -1),
  };
  return { mujoco, model: {}, data: { site_xpos, site_xmat } };
}

function detect(tagIds, upright = true) {
  const { mujoco, model, data } = makeWorld(upright);
  return computeAprilTagDetections(mujoco, model, data, {
    tagIds,
    maxRangeM: 3,
    hfovDeg: DEFAULT_ROBOT_CAMERA_FOV.hfovDeg,
    vfovDeg: DEFAULT_ROBOT_CAMERA_FOV.vfovDeg,
    minFacingDot: 0.55,
  }).detections;
}

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

describe('BIOBUZZ AprilTag clusters', () => {
  it('returns one cluster detection instead of four single detections', () => {
    const detections = detect([30, 31, 32, 33]);
    assert.equal(detections.length, 1);
    const det = detections[0];
    assert.equal(det.isClusterDetection, true);
    assert.equal(det.isSingleDetection, false);
    assert.equal('id' in det, false);
    assert.equal(det.metadata.name, 'RED SCORING');
    assert.equal(det.metadata.shortName, 'RS');
    assert.equal(det.percentClusterFound, 100);
  });

  it('reports partial visibility as percentClusterFound', () => {
    assert.equal(detect([30])[0].percentClusterFound, 25);
    assert.equal(detect([30, 31])[0].percentClusterFound, 50);
    assert.equal(detect([30, 31, 32])[0].percentClusterFound, 75);
  });

  it('SDK 12-ledenlayout: x = −6,5 / −2,75 / 2,75 / 6,5 in, y = 7,1874 in, z = −5,622 in', () => {
    const inch = BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M.map((m) => m.map((v) => +(v / 0.0254).toFixed(4)));
    assert.deepEqual(inch, [
      [-6.5, 7.1874, -5.622],
      [-2.75, 7.1874, -5.622],
      [2.75, 7.1874, -5.622],
      [6.5, 7.1874, -5.622],
    ]);
  });

  it('exposes complete cluster metadata for Blocks getters', () => {
    const det = detect([30, 31, 32, 33])[0];
    assert.equal(det.metadata.distanceUnit, 'METER');
    det.metadata.fieldPosition.forEach((v, i) => assert.ok(close(v, ORIGIN[i]), `fieldPosition[${i}] = ${v}`));
    const q = det.metadata.fieldOrientation;
    assert.ok(q);
    assert.ok(close(Math.hypot(q.w, q.x, q.y, q.z), 1, 1e-12));
    // Kolommen [rechts, weg, boven] = [(0,−1,0), (1,0,0), (0,0,1)] → −90° om Z.
    assert.ok(close(Math.abs(q.w), Math.SQRT1_2, 1e-12) && close(q.z, -Math.sign(q.w) * Math.SQRT1_2, 1e-12));
    assert.ok(close(q.x, 0, 1e-12) && close(q.y, 0, 1e-12));
  });

  it('cluster-pose = SDK-oplossing (p_k − R_c·m_k): oorsprong ≈ CELL-opening, ook met één lid', () => {
    for (const ids of [[30, 31, 32, 33], [30], [33], [31, 32]]) {
      const det = detect(ids)[0];
      // Camera: FTC x = rechts (−Y wereld), y = vooruit (+X), z = omhoog (+Z).
      assert.ok(close(det.ftcPose.x, 0), `${ids}: x ${det.ftcPose.x}`);
      assert.ok(close(det.ftcPose.y, 1), `${ids}: y ${det.ftcPose.y}`);
      assert.ok(close(det.ftcPose.z, 0), `${ids}: z ${det.ftcPose.z}`);
      assert.ok(close(det.ftcPose.roll, 0), `${ids}: roll ${det.ftcPose.roll}`);
      assert.ok(close(det.ftcPose.yaw, 0) && close(det.ftcPose.pitch, 0), `${ids}: yaw/pitch`);
    }
    assert.equal(detect([30])[0].robotPose, null);
  });

  it('ID 30 staat links (gezien vanaf de tegels), 33 rechts', () => {
    const { data } = makeWorld(true);
    const leftY = data.site_xpos[1 * 3 + 1];
    const rightY = data.site_xpos[4 * 3 + 1];
    assert.ok(leftY > rightY, 'camera-rechts = −Y: ID 30 ligt op grotere Y = links in beeld');
  });

  it('roll flips (|roll| = 180°) when the CELL is upside down (opening points down)', () => {
    const flipped = detect([30, 31, 32, 33], false)[0];
    assert.ok(close(Math.abs(flipped.ftcPose.roll), 180), `roll ${flipped.ftcPose.roll}`);
    assert.ok(close(flipped.ftcPose.y, 1), 'zelfde oorsprong');
  });

  it('keeps non-cluster tags as single detections', () => {
    const detections = detect([50]);
    assert.equal(detections.length, 1);
    assert.equal(detections[0].isSingleDetection, true);
    assert.equal(detections[0].isClusterDetection, false);
    assert.equal(detections[0].id, 50);
  });
});
