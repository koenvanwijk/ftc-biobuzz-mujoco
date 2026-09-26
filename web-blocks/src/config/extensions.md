# Simulated extensions — IMU + Webcam / Vision

These devices are **explicitly enabled as simulator extensions** (user-requested).
They reuse official FTC Blocks definitions/generators from the vendor pin. They are
**not** silent placeholders and **not** real sensors / computer vision.

| Device | Config name | JS id / access | Behavior |
|--------|-------------|----------------|----------|
| IMU | `imu` | `imuAsIMU` | Yaw/pitch/roll + angular velocity from MuJoCo body quaternion / free-joint `qvel`. `resetYaw()` stores a yaw offset. |
| Webcam | `Webcam 1` | `navigationAccess.getWebcamName("Webcam 1")` | Name handle for VisionPortal only — no image stream. |
| AprilTag | (processor) | `aprilTagAccess` | Synthetic SDK-12-style BIOBUZZ cluster detections from MJCF sites `apriltag_30`…`apriltag_45`, relative to `robot_up_cam`. |
| VisionPortal | — | `visionPortalAccess` | Streaming state stubs (`STREAMING` / stop / resume). Exposure/focus/gain/WB/PTZ are **no-op stubs** (get/set succeed, no image effect). |
| YawPitchRollAngles | — | `yawPitchRollAnglesAccess` | `getYaw` / `getPitch` / `getRoll` (degrees default; radians if `AngleUnit` says so). |

## Sensor snapshot keys (command bus / worker clock)

- `imuAsIMU`: `{ yawRad, pitchRad, rollRad, wx, wy, wz }`
- `aprilTagDetections`: `{ json: string, generation: number, count: number }`

`aprilTagAccess.getDetections()` returns the **JSON string** (generators call `JSON.parse`).
`getFreshDetections()` returns a new JSON string when `generation` advances, else `null` (`nullOrJson`).

Synthetic `ftcPose` follows the FTC SDK camera frame: **X right, Y forward, Z up**. `range`, `bearing`, and `elevation` use the SDK formulas; `yaw`, `pitch`, and `roll` come from target orientation rather than target position. For BIOBUZZ, cluster `ftcPose.roll` is the right-side-up discriminator and `bearing` is the left/right aiming angle. `robotPose` is deliberately `null`: BIOBUZZ tags/clusters move with the HIVE, so this simulator does not claim an absolute field-localized robot pose.

Synthetic `ftcPose` follows the FTC SDK camera frame: **X right, Y forward, Z up**. `range`, `bearing`, and `elevation` use the SDK formulas; `yaw`, `pitch`, and `roll` come from target orientation rather than target position. In particular, BIOBUZZ cluster `ftcPose.roll` is the right-side-up discriminator and `bearing` is the left/right aiming angle.

## Worlds

| World | IMU | AprilTags |
|-------|-----|-----------|
| BIOBUZZ | from body `robot` / joint `robot_free` | sites on field elements; FOV/facing/range filters (approx.) |
| simple (`REVStarterBot2026`) | from body `chassis` / joint `root` | empty list (no `apriltag_*` sites) |

## Known gaps (simulated)

- BIOBUZZ cluster members 30–45 are grouped into the four official CELL clusters; one visible member yields one cluster detection, and cluster pose targets the moving CELL opening center.\n- No real image CV / lens intrinsics / distortion.
- FOV is a hemisphere + max range (default 3 m), not a calibrated frustum.
- Tag “facing camera” uses site ±Z · direction-to-camera threshold (approx.).
- `robot_up_cam` is upward-tilted; horizontal wall tags may rarely appear — many BIOBUZZ tags lie on horizontal faces.
- AxesReference / AxesOrder on `getRobotOrientation` are not fully modeled.
- Exposure / focus / gain / PTZ / white-balance: **no-op stubs** (get/set succeed and store state; no image effect). `saveNextFrameRaw` still unsupported (throw).

## Adding more devices

1. Add to `HARDWARE` in `hardware.js` with exact JS id.
2. Map in `simulation.json` + MJCF if needed.
3. Bridge in `ftc-runtime/` + worker bindings.
4. Vendor dropdown/toolbox patch documented in `vendor/ftc-blocks/PATCHES.md`.
