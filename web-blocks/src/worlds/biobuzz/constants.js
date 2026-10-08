/** SI constants mirrored from ftc_sim/constants.py */
import { DEFAULT_ROBOT_CAMERA_FOV } from '../../mujoco/robotCamera.js';

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
/**
 * G407 (Competition Manual TU03): een ROBOT mag nooit meer dan 4 SCORING ELEMENTS (POLLEN + NECTAR)
 * tegelijk CONTROLLEREN. Geldt voor voorhopper + achtercompartiment samen; gelanceerde,
 * uitgespuugde of in een FLOWER geplaatste elementen tellen niet meer mee.
 */
export const ROBOT_CONTROL_LIMIT = 4;
export const NECTAR_HOPPER_LOCAL_SLOTS = [
  [-0.08, 0.0, 0.12],
  [-0.08, 0.05, 0.16],
  [-0.08, -0.05, 0.16],
  [-0.12, 0.0, 0.16],
];
export const SHOOT_SPEED = 5.7;
export const SHOOT_ELEVATION_DEG = 75.0;
/** Voorhopper: max 4 (G407; was 8). De 4 preload-POLLEN (G304.G) vullen hem bij de start. */
export const HOPPER_CAPACITY = 4;
export const HOPPER_LOCAL_SLOTS = [
  [0.02, 0.0, 0.1],
  [-0.02, 0.0, 0.1],
  [0.02, 0.04, 0.14],
  [-0.02, -0.04, 0.14],
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
export const HIVE_TIP_JOINT_SIGN = { red: 1.0, blue: -1.0 };
export const HIVE_UPWARD_CELL = {
  red: { 0: 'red_audience', 1: 'red_scoring' },
  blue: { 0: 'blue_scoring', 1: 'blue_audience' },
};
export const CELL_SHELLS = {
  red_scoring: { open_sign: -1.0 },
  red_audience: { open_sign: 1.0 },
  blue_audience: { open_sign: 1.0 },
  blue_scoring: { open_sign: -1.0 },
};
/**
 * HIVE kantelt (Event Field Setup Guide §12.3, HIVE-kalibratie): bij 8 POLLEN, of bij
 * 3 NECTAR + 3 POLLEN in de omhoog-CELL (telling, geen gewichtsmodel).
 */
export const TIP_NECTAR_REQUIRED = 3;
export const TIP_POLLEN_WITH_NECTAR = 3;
export const TIP_POLLEN_ALONE = 8;
export const TIP_POINTS = 20;
export const TILE_THICKNESS = 0.015;
export const POLLEN_R = 0.07112 / 2;
export const NECTAR_R = 0.09144 / 2;
/**
 * TILE-raster (Event Field Setup Guide §6 Fig. 6-2 = manual §9.4 Fig. 9-5), zoals het echte veld
 * (CAD-import is een rotatie, zie ftc_sim/constants.py): kolommen A→F = −X→+X (rode muur −X),
 * rijen 1→6 = −Y→+Y (publiekszijde −Y). Overgenomen uit ftc_sim/constants.py.
 */
export const TILE_SIZE = 0.6096;
export function tileCenter(tile) {
  const col = 'ABCDEF'.indexOf(tile[0].toUpperCase());
  const row = Number(tile.slice(1));
  return [-HALF + (col + 0.5) * TILE_SIZE, -HALF + (row - 0.5) * TILE_SIZE];
}
export const LOADING_W = 0.584; // 23 in, tussen de TILE-naden
export const LOADING_D = 0.2795; // 11 in vanaf de alliantiemuur
/** LOADING ZONE (Guide §8.3: rood A5, blauw F2) als {x0,x1,y0,y1}. */
export const LOADING_ZONE_RECT = {
  red: { x0: -HALF, x1: -HALF + LOADING_D, y0: tileCenter('A5')[1] - LOADING_W / 2, y1: tileCenter('A5')[1] + LOADING_W / 2 },
  blue: { x0: HALF - LOADING_D, x1: HALF, y0: tileCenter('F2')[1] - LOADING_W / 2, y1: tileCenter('F2')[1] + LOADING_W / 2 },
};
/** GARDEN (Guide §8.4: rood A1 tegen de publieksmuur −Y, blauw F6 tegen de achtermuur +Y). */
export const GARDEN_RECT = {
  red: { x0: -HALF, x1: -HALF + 0.584, y0: -HALF, y1: -HALF + 0.051 },
  blue: { x0: HALF - 0.584, x1: HALF, y0: HALF - 0.051, y1: HALF },
};
/** G427: extra NECTAR komt via de LOADING ZONE (rood A5, blauw F2) het veld op; zie ftc_sim/constants.py. */
export const EXTRA_NECTAR_SPAWN = {
  red: [-1.5988, 0.9144, 0.08072],
  blue: [1.5988, -0.9144, 0.08072],
};
/** Raster (2 × 3, > NECTAR-diameter) voor opeenvolgende vrijgaves binnen de LOADING ZONE. */
export const EXTRA_NECTAR_GRID_STEP = 0.1;
export const EXTRA_NECTAR_PARK_Z = 3.5;
export const NECTAR_STAGED_PER_ALLIANCE = 3;
export const NECTAR_MAX_PER_ALLIANCE = 8;
export const NECTAR_EXTRA_POOL = 5;

/** Flower place (mirrored from ftc_sim/constants.py) */
export const FLOWER_CAD_XY = [
  [-0.59417, 1.72826], // achtermuur (+Y), naad B/C
  [0.59417, -1.72826], // publieksmuur (−Y), naad D/E
  [-1.72826, -0.59417], // rode muur (−X), naad 2/3
  [1.72826, 0.59417], // blauwe muur (+X), naad 4/5
];
export const FLOWER_FLOOR_H = 0.006;
export const FLOWER_COLLAR_INNER_R = NECTAR_R + 0.002;
export const FLOWER_POLLEN_CAPACITY = 4;
export const FLOWER_PLACE_RANGE = 0.55;
export const FLOWER_NECTAR_PLACE_Z = TILE_THICKNESS + FLOWER_FLOOR_H + NECTAR_R + 0.001;
export const FLOWER_PLANT_CAPACITY = 8; // soft cap mixed nectar+pollen stack
export const POLLEN_DIA = 0.07112;
/**
 * FLOWER-scoringsvolume (TU03 §10.5.2): tussen de middelste en de bovenste ring. Middelste ring ≈
 * onderring 1,0 cm + Retrieval Opening 9,0 cm (§9.7) boven de TILES; bovenrand 54,6 cm. Benadering
 * zonder CAD Reference 10-4. Straal = binnenkant van de 4 in-opening.
 */
export const FLOWER_SCORE_Z_MIN = 0.10;
export const FLOWER_SCORE_Z_MAX = 0.546;
export const FLOWER_SCORE_R = 0.0508 + 0.005;
export const NECTAR_DIA = 0.09144;

/** Robot upward camera local pose (robot frame), above hopper. Look ≈ normalize(0.77, 0, 0.64). */
export const ROBOT_UP_CAM_POS = [0.16, 0.0, 0.28];
/** Look direction in robot frame ≈ normalize(0.77, 0, 0.64). */
export const ROBOT_UP_CAM_LOOK = [0.77, 0.0, 0.64];
/**
 * Logitech Brio 4K robot camera, default 90° diagonal preset (16:9 sensor) streamed at 640x480
 * (4:3 center crop, vertical kept): vertical ≈ 52.2°, horizontal ≈ 66.3°.
 * Source of truth: ../../mujoco/robotCamera.js (+ simulation.json webcam.camera); runtime
 * preset changes go through viewer.setCameraFov / adapter.setCameraFov.
 */
export const ROBOT_UP_CAM_DFOV = DEFAULT_ROBOT_CAMERA_FOV.dfovDeg;
export const ROBOT_UP_CAM_FOVY = DEFAULT_ROBOT_CAMERA_FOV.vfovDeg;
export const ROBOT_UP_CAM_HFOV = DEFAULT_ROBOT_CAMERA_FOV.hfovDeg;
export const ROBOT_UP_CAM_ASPECT = DEFAULT_ROBOT_CAMERA_FOV.aspect;
