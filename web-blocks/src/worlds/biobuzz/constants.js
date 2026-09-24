/** SI constants mirrored from ftc_sim/constants.py */

export const FIELD_SIZE = 3.6576;
export const HALF = FIELD_SIZE / 2.0;

/** REV Starter Bot practical tank-drive (mirrored from ftc_sim/constants.py).
 * Theoretical free-speed top ≈ 1.41 m/s (20:1, ~6000 rpm, 90 mm); practical: 1.2. */
export const WHEEL_R = 0.045; // 90 mm
export const TRACK_WIDTH = 0.28;
export const MAX_LINEAR_VEL = 1.2; // m/s practical working top
export const MAX_WHEEL_VEL = MAX_LINEAR_VEL / WHEEL_R; // ≈ 26.667 rad/s
export const MAX_YAW_RATE = 4.8; // rad/s practical physical spin; auto timing
/** Kinematic full-stick yaw ceiling; MuJoCo slip lands near MAX_YAW_RATE. */
export const MAX_YAW_CMD = (2.0 * MAX_LINEAR_VEL) / TRACK_WIDTH; // ≈ 8.57
export const DRIVE_LINEAR_ACCEL = 2.4; // m/s² ≈ 0.30 m to top speed

export const INTAKE_CAPTURE_R = 0.14;
export const NECTAR_INTAKE_CAPTURE_R = 0.16;
export const NECTAR_HOPPER_CAPACITY = 4; // rear mixed FIFO; full at 4
export const NECTAR_HOPPER_LOCAL_SLOTS = [
  [-0.08, 0.0, 0.12],
  [-0.08, 0.05, 0.16],
  [-0.08, -0.05, 0.16],
  [-0.12, 0.0, 0.16],
];
export const SHOOT_SPEED = 5.7;
export const SHOOT_ELEVATION_DEG = 75.0;
export const HOPPER_CAPACITY = 8;
export const HOPPER_LOCAL_SLOTS = [
  [0.02, 0.0, 0.1],
  [-0.02, 0.0, 0.1],
  [0.02, 0.04, 0.14],
  [-0.02, 0.04, 0.14],
  [0.02, -0.04, 0.14],
  [-0.02, -0.04, 0.14],
  [0.0, 0.0, 0.18],
  [0.0, 0.0, 0.22],
];

/** Staging indices 24–27 are the 4 preload pollen. */
export const PRELOAD_SLICE = [24, 28];

export const CELL_OPEN_W = 0.508;
export const CELL_OPEN_H = 0.356;
export const CELL_OPEN_D = 0.305;
export const CELL_CUP_OPEN_W = 0.532;
export const CELL_CUP_OPEN_H = 0.380;
export const CELL_CUP_WALL_T = 0.018;
export const CELL_CUP_LIP_T = 0.004;
export const CELL_CUP_LIP_H = 0.010;
export const HIVE_TIP_TRAVEL_DEG = 60.0;
export const HIVE_PIVOT_Z = 1.1165;
export const HIVE_TIP_JOINT_SIGN = { red: -1.0, blue: 1.0 };
export const HIVE_UPWARD_CELL = {
  red: { 0: 'red_audience', 1: 'red_scoring' },
  blue: { 0: 'blue_scoring', 1: 'blue_audience' },
};
export const CELL_SHELLS = {
  red_scoring: { open_sign: 1.0 },
  red_audience: { open_sign: -1.0 },
  blue_audience: { open_sign: -1.0 },
  blue_scoring: { open_sign: 1.0 },
};
export const TIP_NECTAR_REQUIRED = 3;
export const TIP_POLLEN_WITH_NECTAR = 4;
export const TIP_POLLEN_ALONE = 8;
export const TIP_POINTS = 20;
export const TILE_THICKNESS = 0.015;
export const POLLEN_R = 0.07112 / 2;
export const NECTAR_R = 0.09144 / 2;
export const EXTRA_NECTAR_SPAWN = {
  red: [-1.45, -1.25, 0.08072],
  blue: [1.45, 1.25, 0.08072],
};
export const EXTRA_NECTAR_PARK_Z = 3.5;
export const NECTAR_STAGED_PER_ALLIANCE = 3;
export const NECTAR_MAX_PER_ALLIANCE = 8;
export const NECTAR_EXTRA_POOL = 5;

/** Flower place (mirrored from ftc_sim/constants.py) */
export const FLOWER_CAD_XY = [
  [0.59417, 1.72826],
  [-0.59417, -1.72826],
  [-1.72826, 0.59417],
  [1.72826, -0.59417],
];
export const FLOWER_FLOOR_H = 0.006;
export const FLOWER_COLLAR_INNER_R = NECTAR_R + 0.002;
export const FLOWER_POLLEN_CAPACITY = 4;
export const FLOWER_PLACE_RANGE = 0.55;
export const FLOWER_NECTAR_PLACE_Z = TILE_THICKNESS + FLOWER_FLOOR_H + NECTAR_R + 0.001;
export const FLOWER_PLANT_CAPACITY = 8; // soft cap mixed nectar+pollen stack
export const POLLEN_DIA = 0.07112;
export const NECTAR_DIA = 0.09144;

/** Robot upward camera local pose (robot frame), above hopper. Look ≈ normalize(0.77, 0, 0.64). */
export const ROBOT_UP_CAM_POS = [0.16, 0.0, 0.28];
/** Look direction in robot frame ≈ normalize(0.77, 0, 0.64). */
export const ROBOT_UP_CAM_LOOK = [0.77, 0.0, 0.64];
export const ROBOT_UP_CAM_FOVY = 70;
