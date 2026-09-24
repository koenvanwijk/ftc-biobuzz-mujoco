import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createImuAsIMU } from '../../src/ftc-runtime/imu.js';
import { yawPitchRollAnglesAccess } from '../../src/ftc-runtime/yawPitchRollAngles.js';
import { createAprilTagAccess } from '../../src/ftc-runtime/aprilTag.js';
import { nullOrJson } from '../../src/ftc-runtime/helpers.js';
import { quatToYawPitchRoll, computeAprilTagDetections } from '../../src/mujoco/simSensors.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('IMU simulated bridge', () => {
  it('resetYaw zeros reported yaw', () => {
    let yawRad = Math.PI / 2; // 90°
    const imu = createImuAsIMU(() => ({
      yawRad,
      pitchRad: 0,
      rollRad: 0,
      wx: 0,
      wy: 0,
      wz: 0,
    }));
    const before = imu.getRobotYawPitchRollAngles();
    assert.ok(Math.abs(yawPitchRollAnglesAccess.getYaw(before) - 90) < 1e-6);
    imu.resetYaw();
    const after = imu.getRobotYawPitchRollAngles();
    assert.ok(Math.abs(yawPitchRollAnglesAccess.getYaw(after)) < 1e-6);
    // Change underlying yaw — reported stays relative to offset
    yawRad = Math.PI; // 180° absolute → 90° relative
    const rel = imu.getRobotYawPitchRollAngles();
    assert.ok(Math.abs(yawPitchRollAnglesAccess.getYaw(rel) - 90) < 1e-6);
  });

  it('getYaw respects AngleUnit RADIANS', () => {
    const imu = createImuAsIMU(() => ({
      yawRad: Math.PI / 4,
      pitchRad: 0,
      rollRad: 0,
      wx: 0,
      wy: 0,
      wz: 0,
    }));
    const ypr = imu.getRobotYawPitchRollAngles();
    assert.ok(Math.abs(yawPitchRollAnglesAccess.getYaw(ypr, 'RADIANS') - Math.PI / 4) < 1e-9);
    assert.ok(Math.abs(yawPitchRollAnglesAccess.getYaw(ypr, 'DEGREES') - 45) < 1e-6);
  });
});

describe('aprilTagAccess', () => {
  it('getDetections returns parseable JSON string', () => {
    const sample = [
      {
        id: 30,
        ftcPose: { x: 0.1, y: 0, z: 1, range: 1, yaw: 0, pitch: 0, roll: 0, bearing: 0, elevation: 0 },
        isSingleDetection: true,
        isClusterDetection: false,
      },
    ];
    let generation = 1;
    const access = createAprilTagAccess(() => ({
      json: JSON.stringify(sample),
      generation,
    }));
    const raw = access.getDetections({});
    assert.equal(typeof raw, 'string');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, 30);
    assert.equal(parsed[0].ftcPose.z, 1);

    const fresh1 = access.getFreshDetections({});
    assert.equal(typeof fresh1, 'string');
    assert.deepEqual(nullOrJson(fresh1)[0].id, 30);
    assert.equal(access.getFreshDetections({}), null);
    generation = 2;
    assert.ok(access.getFreshDetections({}) != null);
  });
});

describe('vendor IMU/Webcam patch', () => {
  it('dropdowns and toolbox categories present in FtcOfflineBlocks.js', () => {
    const src = readFileSync(join(root, 'vendor/ftc-blocks/js/FtcOfflineBlocks.js'), 'utf8');
    assert.match(src, /\['imu',\s*'imuAsIMU'\]/);
    assert.match(src, /\['Webcam 1',\s*'Webcam 1'\]/);
    assert.ok(src.includes('category name="IMU"'));
    assert.ok(src.includes('category name="Vision"'));
    assert.ok(src.includes('imu_initialize'));
    assert.ok(src.includes('aprilTagProcessor_easyCreateWithDefaults'));
    assert.ok(src.includes('visionPortal_easyCreateWithDefaults_oneProcessor'));
  });
});

describe('quatToYawPitchRoll', () => {
  it('identity quat → zero angles', () => {
    const ypr = quatToYawPitchRoll(1, 0, 0, 0);
    assert.ok(Math.abs(ypr.yawRad) < 1e-9);
    assert.ok(Math.abs(ypr.pitchRad) < 1e-9);
    assert.ok(Math.abs(ypr.rollRad) < 1e-9);
  });
});

describe('Synthetic AprilTag FOV', () => {
  it('FOV cone rejects off-axis tags', () => {
    // Camera at origin, look = +X. columns X=(0,1,0), Y=(0,0,1), Z=(-1,0,0) → look=-Z=+X
    const camMatRM = [0, 0, -1, 1, 0, 0, 0, 1, 0];
    // Tag Z = +X so printed −Z faces camera
    const tagMatRM = [0, 0, 1, 0, 1, 0, -1, 0, 0];
    const xpos = new Float64Array(6);
    const xmat = new Float64Array(18);
    xmat.set(camMatRM, 0);
    xmat.set(tagMatRM, 9);
    const mujoco = {
      mjtObj: { mjOBJ_SITE: { value: 1 } },
      mj_name2id: (_m, _t, name) => {
        if (name === 'robot_up_cam') return 0;
        if (name === 'apriltag_30') return 1;
        return -1;
      },
    };
    const data = { site_xpos: xpos, site_xmat: xmat };

    xpos[3] = 1.5;
    xpos[4] = 0;
    xpos[5] = 0;
    let r = computeAprilTagDetections(mujoco, {}, data, {
      tagIds: [30],
      maxRangeM: 3,
      fovyDeg: 70,
      minFacingDot: 0.55,
    });
    assert.equal(r.detections.length, 1);

    xpos[3] = 0.4;
    xpos[4] = 2.2;
    xpos[5] = 0;
    r = computeAprilTagDetections(mujoco, {}, data, {
      tagIds: [30],
      maxRangeM: 3,
      fovyDeg: 70,
      minFacingDot: 0.55,
    });
    assert.equal(r.detections.length, 0);
  });
});
