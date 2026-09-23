"""Official BIOBUZZ field dimensions in SI meters (Competition Manual §9–§10)."""

from __future__ import annotations

# --- Field ---
FIELD_SIZE = 3.6576  # 144 in interior
HALF = FIELD_SIZE / 2.0
TILE_SIZE = 0.6096  # 24 in
TILE_THICKNESS = 0.015  # ~0.59 in
WALL_HEIGHT = 0.3048  # 1 ft
WALL_THICKNESS = 0.05

# --- Gardens (tape zones) ---
GARDEN_LEN = 0.584  # 23 in along wall
GARDEN_WIDTH = 0.051  # 2 in

# --- Loading zones ---
LOADING_W = 0.584  # 23 in
LOADING_D = 0.2795  # 11 in

# --- HIVE frame ---
HIVE_FRAME_W = 1.2565  # 49.46 in
HIVE_FRAME_D = 0.9895  # 38.95 in
HIVE_PIVOT_Z = 1.1165  # 43.95 in above tiles
CELL_OPEN_W = 0.508  # 20 in (official opening; tip/scoring volume)
CELL_OPEN_H = 0.356  # 14 in
CELL_OPEN_D = 0.305  # 12 in
# Invisible cup + visual rim inner aperture (thin Goal Rib). Wider than CELL_OPEN so
# collision opening sits at the rim edge — no deep pocket behind a thick lip.
CELL_CUP_OPEN_W = 0.532  # matches regenerated cell_rim_* inner (~10 mm ring)
CELL_CUP_OPEN_H = 0.380
CELL_CUP_WALL_T = 0.018  # back/side containment thickness (tip spill)
CELL_CUP_LIP_T = 0.004  # shallow front sill at opening plane (not a recessed ledge)
CELL_CUP_LIP_H = 0.010  # sill height along local +Z (floor side)
CELL_SPACING = 0.478  # ~18.8 in between cells (center-to-center approx)
# Bi-stable tip from official Field CAD (v26-27.2): cell-to-cell axis ≈ 30° from
# horizontal about ±X; CELL bottom faces (AprilTag plates) tip 60° from horizontal.
HIVE_TIP_ANGLE_DEG = 30.0  # cell axis from horizontal (CAD measured 30.08°)
# Bottom-face (AprilTag plate) tip from horizontal equals cell-axis tip (30°):
# the plate contains the cell axis, so plane tip = 30°, not 60°.
# Rx maps geom +Z → outward underside normal (toward tiles):
#   red:  euler_x = -150° → n = (0, +0.5, -0.866)
#   blue: euler_x = +150° → n = (0, -0.5, -0.866)
# (±120° is 90° off those normals and makes tags look like vertical fins.)
HIVE_TAG_FACE_TIP_DEG = 30.0

# --- FLOWER (official CAD Layer-C centroids, Z-up, field center origin) ---
# Extracted from Field CAD STEP v26-27.2 via cascadio (Y-up → Z-up swap).
FLOWER_TOP_DIA = 0.1015  # 4 in
FLOWER_TOP_Z = 0.546  # 21.5 in above tiles
FLOWER_BOTTOM_ID = 0.071  # 2.79 in
FLOWER_BOTTOM_H = 0.01
FLOWER_RETRIEVAL_H = 0.09
FLOWER_OFFSET_FROM_WALL = 0.08  # legacy mid-wall approx (prefer FLOWER_CAD_XY)
# Official CAD positions (meters): (name, x, y, yaw_deg facing inward)
FLOWER_CAD_XY = [
    ("flower_pos_y", 0.59417, 1.72826, 180.0),   # +Y wall, offset +X
    ("flower_neg_y", -0.59417, -1.72826, 0.0),  # -Y wall, offset -X
    ("flower_neg_x", -1.72826, 0.59417, 90.0),  # -X wall, offset +Y
    ("flower_pos_x", 1.72826, -0.59417, -90.0),  # +X wall, offset -Y
]

# --- POLLEN / NECTAR ---
POLLEN_DIA = 0.07112  # 2.8 in
POLLEN_R = POLLEN_DIA / 2.0
POLLEN_MASS = 0.03
# Flower retention collar (snug cup; pollen sit recessed until robot bump)
# Collar sized for NECTAR so placed nectar sits low and blocks passage;
# pollen still stacks inside the same cup (slightly looser fit).
FLOWER_COLLAR_WALL_H = 0.10
FLOWER_COLLAR_WALL_T = 0.014
FLOWER_COLLAR_SEGS = 12
FLOWER_FLOOR_H = 0.006
NECTAR_DIA = 0.09144  # 3.6 in
NECTAR_R = NECTAR_DIA / 2.0
NECTAR_MASS = 0.05
FLOWER_COLLAR_INNER_R = NECTAR_R + 0.002  # ~0.0477 m — fits nectar + pollen
FLOWER_POLLEN_CAPACITY = 4  # stacked pollen per flower (initial + refill)
FLOWER_PLACE_RANGE = 0.55  # robot-to-flower XY range for X-key place from rear
# Base plant Z helpers (stacking uses per-ball radius; see mechanisms._stack_center_zs)
FLOWER_NECTAR_PLACE_Z = TILE_THICKNESS + FLOWER_FLOOR_H + NECTAR_R + 0.001
FLOWER_PLANT_CAPACITY = 8  # soft cap for mixed nectar+pollen planted stack per flower
NUM_POLLEN = 40
NUM_PRELOAD = 4  # start inside hopper when available

# --- Tank robot (REV Starter Bot practical numbers) ---
ROBOT_L = 0.40
ROBOT_W = 0.35
ROBOT_H = 0.12
WHEEL_R = 0.045  # 90 mm wheels
WHEEL_W = 0.03
TRACK_WIDTH = 0.28  # left/right wheel center distance
# Theoretical free-speed top ≈ 1.41 m/s (20:1, ~6000 rpm free, 90 mm); practical working top:
MAX_LINEAR_VEL = 1.2  # m/s
MAX_WHEEL_VEL = MAX_LINEAR_VEL / WHEEL_R  # ≈ 26.667 rad/s
MAX_YAW_RATE = 4.8  # rad/s practical physical spin (~360° in 1.2–1.4 s); used for auto timing
# Command yaw ceiling = full opposite sticks (2*MAX_LINEAR/TRACK); MuJoCo slip lands near MAX_YAW_RATE.
MAX_YAW_CMD = (2.0 * MAX_LINEAR_VEL) / TRACK_WIDTH  # ≈ 8.57 rad/s kinematic
DRIVE_LINEAR_ACCEL = 2.4  # m/s² ≈ 0.30 m to reach 1.2 m/s (v²/(2s))

# --- Intake / arc shooter ---
INTAKE_CAPTURE_R = 0.14  # m — capture sphere around intake site
INTAKE_SITE_POS = (0.22, 0.0, 0.04)  # robot frame: +X front (pollen), low
NECTAR_INTAKE_SITE_POS = (-0.22, 0.0, 0.05)  # robot frame: −X rear (nectar), low
NECTAR_INTAKE_CAPTURE_R = 0.16  # larger capture for NECTAR dia ~9 cm
NECTAR_HOPPER_CAPACITY = 4  # rear mixed FIFO (nectar + pollen); full at 4
NECTAR_HOPPER_LOCAL_SLOTS = [  # rear stash in robot frame
    (-0.08, 0.0, 0.12),
    (-0.08, 0.05, 0.16),
    (-0.08, -0.05, 0.16),
    (-0.12, 0.0, 0.16),
]
SHOOTER_MUZZLE_POS = (0.12, 0.0, 0.14)  # robot frame muzzle near front/top (aim robot-forward + up)
SHOOT_SPEED = 5.7  # m/s launch speed
SHOOT_ELEVATION_DEG = 75.0  # elevation from horizontal; aim along robot +X (forward)

# --- HIVE tipping (bi-stable about ±X through pivot) ---
HIVE_TIP_TRAVEL_DEG = 60.0  # CAD pose → other stable pose
HIVE_TIP_JOINT_SIGN = {"hive_red": -1.0, "hive_blue": 1.0}
# Upward CELL per tip state (0 = CAD start, 1 = after tip)
HIVE_UPWARD_CELL = {
    "red": {0: "red_audience", 1: "red_scoring"},
    "blue": {0: "blue_scoring", 1: "blue_audience"},
}
TIP_NECTAR_REQUIRED = 3
TIP_POLLEN_WITH_NECTAR = 4
TIP_POLLEN_ALONE = 8
TIP_POINTS = 20  # points awarded to that alliance color per HIVE tip
# Extra nectar appears in alliance loading area after each tip
# Start with 3 staged per alliance; each tip adds 1 until NECTAR_MAX_PER_ALLIANCE.
NECTAR_STAGED_PER_ALLIANCE = 3
NECTAR_MAX_PER_ALLIANCE = 8
NECTAR_EXTRA_POOL = NECTAR_MAX_PER_ALLIANCE - NECTAR_STAGED_PER_ALLIANCE  # 5
EXTRA_NECTAR_SPAWN = {
    "red": (-1.45, -1.25, TILE_THICKNESS + NECTAR_R + 0.02),
    "blue": (1.45, 1.25, TILE_THICKNESS + NECTAR_R + 0.02),
}
EXTRA_NECTAR_PARK_Z = 3.5  # above field until released (kinematic hold)
HOPPER_CAPACITY = 8
HOPPER_LOCAL_SLOTS = [  # robot-frame stash positions inside hopper volume
    (0.02, 0.0, 0.10),
    (-0.02, 0.0, 0.10),
    (0.02, 0.04, 0.14),
    (-0.02, 0.04, 0.14),
    (0.02, -0.04, 0.14),
    (-0.02, -0.04, 0.14),
    (0.0, 0.0, 0.18),
    (0.0, 0.0, 0.22),
]

# --- AprilTags (Competition Manual §9.9 + BIOBUZZAprilTagProduction.pdf) ---
APRILTAG_SIZE = 0.08255  # 3.25 in square
APRILTAG_FAMILY = "36h11"
# CAD plate centroids (Z-up) from field_coarse.glb AprilTag solids; tags are parented
# under the matching CELL body so xpos follows if the HIVE tips later.
# tip_euler_x: geom +Z faces tiles along the tipped bottom (Rx maps +Z → face normal).
# CAD AprilTag plate centroids (Z-up) from field_coarse.glb am-5888-* solids.
# tip_euler_x: Rx so geom +Z = underside outward normal (toward tiles).
APRILTAG_CELLS = {
    "red_scoring": {
        "ids": (30, 31, 32, 33),
        "pos": (-0.32364, -0.28955, 0.90536),
        "tip_euler_x": -150.0,  # red underside n=(0,+0.5,-0.866)
        "hive": "hive_red",
        "cell": "red_cell_scoring",
    },
    "red_audience": {
        "ids": (34, 35, 36, 37),
        "pos": (-0.32364, 0.32747, 1.26160),
        "tip_euler_x": -150.0,
        "hive": "hive_red",
        "cell": "red_cell_audience",
    },
    "blue_audience": {
        "ids": (38, 39, 40, 41),
        "pos": (0.32406, 0.28955, 0.90536),
        "tip_euler_x": 150.0,  # blue underside n=(0,-0.5,-0.866)
        "hive": "hive_blue",
        "cell": "blue_cell_audience",
    },
    "blue_scoring": {
        "ids": (42, 43, 44, 45),
        "pos": (0.32406, -0.32747, 1.26160),
        "tip_euler_x": 150.0,
        "hive": "hive_blue",
        "cell": "blue_cell_scoring",
    },
}

# CELL cavity centers (midpoint of CAD top/bottom skins) + tip — used for
# NECTAR staging / invisible cell frames (no opaque box shells).
CELL_SHELLS = {
    # open_sign: local +Y is opening when +1; audience cells face the opposite way on the tipped hive
    "red_scoring": {
        "pos": (-0.3236, -0.40465, 1.02855),
        "tip_euler_x": -150.0,
        "open_sign": 1.0,
        "hive": "hive_red",
        "color": "red",
    },
    "red_audience": {
        "pos": (-0.3236, 0.27815, 1.42300),
        "tip_euler_x": -150.0,
        "open_sign": -1.0,
        "hive": "hive_red",
        "color": "red",
    },
    "blue_audience": {
        "pos": (0.3241, 0.40465, 1.02855),
        "tip_euler_x": 150.0,
        "open_sign": -1.0,
        "hive": "hive_blue",
        "color": "blue",
    },
    "blue_scoring": {
        "pos": (0.3241, -0.27815, 1.42300),
        "tip_euler_x": 150.0,
        "open_sign": 1.0,
        "hive": "hive_blue",
        "color": "blue",
    },
}

# Pre-staged NECTAR inside upward-facing CELLs (Competition Manual §10.3.1).
# CAD centroids from field_coarse.glb am-5852 Red/Blue Nectar (hive instances).
# Red → red audience CELL; blue → blue scoring CELL; line against back wall.
NECTAR_RED_POS = [
    (-0.5332, 0.2414, 1.2685),
    (-0.4412, 0.2414, 1.2685),
    (-0.3493, 0.2414, 1.2685),
]
NECTAR_BLUE_POS = [
    (0.3497, -0.2414, 1.2685),
    (0.4417, -0.2414, 1.2685),
    (0.5336, -0.2414, 1.2685),
]

# Colors (RGBA 0–1)
YELLOW = (1.0, 0.85, 0.1, 1.0)
RED = (0.85, 0.12, 0.12, 1.0)
BLUE = (0.15, 0.35, 0.9, 1.0)
GRAY = (0.45, 0.45, 0.48, 1.0)
DARK = (0.2, 0.2, 0.22, 1.0)
TILE_A = (0.55, 0.55, 0.58, 1.0)
TILE_B = (0.48, 0.48, 0.52, 1.0)
GREEN = (0.2, 0.55, 0.25, 1.0)
CHASSIS = (0.25, 0.25, 0.28, 1.0)
