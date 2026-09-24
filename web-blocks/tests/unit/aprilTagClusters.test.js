import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAprilTagDetections } from '../../src/mujoco/simSensors.js';

const CAM_MAT = [0, 0, -1, 1, 0, 0, 0, 1, 0];
const TAG_MAT = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const FLIPPED_X = [1, 0, 0, 0, -1, 0, 0, 0, -1];

function makeWorld(bodyMatrix = IDENTITY) {
  const siteNames = ['robot_up_cam', 'apriltag_30', 'apriltag_31', 'apriltag_32', 'apriltag_33', 'apriltag_50'];
  const siteIds = new Map(siteNames.map((name, i) => [name, i]));
  const bodyIds = new Map([['red_scoring_shell', 0]]);

  const site_xpos = new Float64Array(siteNames.length * 3);
  const site_xmat = new Float64Array(siteNames.length * 9);
  site_xmat.set(CAM_MAT, 0);

  const ys = [-0.15, -0.05, 0.05, 0.15, 0.0];
  for (let i = 1; i < siteNames.length; i++) {
    site_xpos[i * 3] = 1.0;
    site_xpos[i * 3 + 1] = ys[i - 1];
    site_xpos[i * 3 + 2] = 0.0;
    site_xmat.set(TAG_MAT, i * 9);
  }

  const xpos = new Float64Array([1.0, 0.0, 0.0]);
  const xmat = new Float64Array(bodyMatrix);

  const mujoco = {
    mjtObj: {
      mjOBJ_SITE: { value: 1 },
      mjOBJ_BODY: { value: 2 },
    },
    mj_name2id: (_model, type, name) => {
      if (type === 1) return siteIds.get(name) ?? -1;
      if (type === 2) return bodyIds.get(name) ?? -1;
      return -1;
    },
  };

  return {
    mujoco,
    model: {},
    data: { site_xpos, site_xmat, xpos, xmat },
  };
}

function detect(tagIds, bodyMatrix = IDENTITY) {
  const { mujoco, model, data } = makeWorld(bodyMatrix);
  return computeAprilTagDetections(mujoco, model, data, {
    tagIds,
    maxRangeM: 3,
    fovyDeg: 70,
    minFacingDot: 0.55,
  }).detections;
}

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

  it('uses the CELL opening center as cluster pose origin', () => {
    const det = detect([30, 31, 32, 33])[0];
    // red_scoring_shell at [1,0,0], local +Y opening, depth=0.305 m.
    assert.ok(Math.abs(det.ftcPose.x - 0.1525) < 1e-9);
    assert.ok(Math.abs(det.ftcPose.y) < 1e-9);
    assert.ok(Math.abs(det.ftcPose.z - 1.0) < 1e-9);
    assert.ok(Math.abs(det.robotPose.position.y - 0.1525) < 1e-9);
  });

  it('roll flips when the CELL orientation flips', () => {
    const upright = detect([30], IDENTITY)[0];
    const flipped = detect([30], FLIPPED_X)[0];
    assert.ok(Math.abs(upright.ftcPose.roll) < 1e-9);
    assert.ok(Math.abs(Math.abs(flipped.ftcPose.roll) - 180) < 1e-9);
  });

  it('keeps non-cluster tags as single detections', () => {
    const detections = detect([50]);
    assert.equal(detections.length, 1);
    assert.equal(detections[0].isSingleDetection, true);
    assert.equal(detections[0].isClusterDetection, false);
    assert.equal(detections[0].id, 50);
  });
});
