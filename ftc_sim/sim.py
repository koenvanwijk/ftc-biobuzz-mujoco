"""MuJoCo simulation helpers."""

from __future__ import annotations

from pathlib import Path

import mujoco
import numpy as np

from . import constants as C
from .field_bounds import FieldBoundsReturn, make_field_bounds
from .hive_tip import HiveTipController
from .mechanisms import IntakeShooter
from .scene import cad_mesh_status, write_scene


def load_model(regen: bool = True) -> tuple[mujoco.MjModel, mujoco.MjData]:
    assets = Path(__file__).resolve().parent / "assets"
    xml_path = assets / "biobuzz_scene.xml"
    if regen or not xml_path.exists():
        write_scene(xml_path)
    model = mujoco.MjModel.from_xml_path(str(xml_path))
    data = mujoco.MjData(model)
    mujoco.mj_resetDataKeyframe(model, data, 0)
    mujoco.mj_forward(model, data)
    return model, data


def make_intake_shooter(model: mujoco.MjModel, data: mujoco.MjData, preload: bool = True) -> IntakeShooter:
    mech = IntakeShooter(model, data)
    if preload:
        mech.reset_and_preload()
        mujoco.mj_forward(model, data)
    return mech


def make_hive_tip(model: mujoco.MjModel, data: mujoco.MjData) -> HiveTipController:
    tip = HiveTipController(model, data)
    tip.reset()
    mujoco.mj_forward(model, data)
    return tip


# Stateful tank-drive targets / last commanded wheel rad/s (slew-limited).
_drive_tgt_l = 0.0
_drive_tgt_r = 0.0
_drive_cmd_l = 0.0
_drive_cmd_r = 0.0


def reset_drive_state() -> None:
    """Clear slew state (call after keyframe / hard reset)."""
    global _drive_tgt_l, _drive_tgt_r, _drive_cmd_l, _drive_cmd_r
    _drive_tgt_l = _drive_tgt_r = 0.0
    _drive_cmd_l = _drive_cmd_r = 0.0


def _clamp_tank_linear(v_l: float, v_r: float) -> tuple[float, float]:
    """Clamp stick-mapped linear wheel speeds to MAX_LINEAR_VEL and MAX_YAW_CMD.

    Yaw uses kinematic full-stick ceiling (MAX_YAW_CMD), not MAX_YAW_RATE: MuJoCo
    tire slip already brings in-place spin near the practical ~4.8 rad/s target.
    """
    v_avg = 0.5 * (v_l + v_r)
    yaw = (v_r - v_l) / C.TRACK_WIDTH
    scale = 1.0
    if abs(v_avg) > C.MAX_LINEAR_VEL and abs(v_avg) > 1e-12:
        scale = min(scale, C.MAX_LINEAR_VEL / abs(v_avg))
    if abs(yaw) > C.MAX_YAW_CMD and abs(yaw) > 1e-12:
        scale = min(scale, C.MAX_YAW_CMD / abs(yaw))
    return v_l * scale, v_r * scale


def set_tank_power(model: mujoco.MjModel, data: mujoco.MjData, left: float, right: float) -> None:
    """Map stick [-1, 1] → clamped linear targets; slew applied each physics step."""
    global _drive_tgt_l, _drive_tgt_r
    left = float(np.clip(left, -1.0, 1.0))
    right = float(np.clip(right, -1.0, 1.0))
    v_l, v_r = _clamp_tank_linear(left * C.MAX_LINEAR_VEL, right * C.MAX_LINEAR_VEL)
    _drive_tgt_l = v_l / C.WHEEL_R
    _drive_tgt_r = v_r / C.WHEEL_R


def apply_drive_slew(model: mujoco.MjModel, data: mujoco.MjData, dt: float | None = None) -> None:
    """Slew commanded wheel rad/s toward targets (DRIVE_LINEAR_ACCEL → rad/s²)."""
    global _drive_cmd_l, _drive_cmd_r
    if dt is None:
        dt = float(model.opt.timestep)
    dt = max(0.0, float(dt))
    max_dw = (C.DRIVE_LINEAR_ACCEL / C.WHEEL_R) * dt  # rad/s
    # left
    dl = _drive_tgt_l - _drive_cmd_l
    if abs(dl) <= max_dw:
        _drive_cmd_l = _drive_tgt_l
    else:
        _drive_cmd_l += max_dw if dl > 0 else -max_dw
    # right
    dr = _drive_tgt_r - _drive_cmd_r
    if abs(dr) <= max_dw:
        _drive_cmd_r = _drive_tgt_r
    else:
        _drive_cmd_r += max_dw if dr > 0 else -max_dw
    # Clamp to actuator range
    lim = C.MAX_WHEEL_VEL
    _drive_cmd_l = float(np.clip(_drive_cmd_l, -lim, lim))
    _drive_cmd_r = float(np.clip(_drive_cmd_r, -lim, lim))
    data.ctrl[0] = _drive_cmd_l
    data.ctrl[1] = _drive_cmd_r


def step(
    model: mujoco.MjModel,
    data: mujoco.MjData,
    n: int = 1,
    mech: IntakeShooter | None = None,
    hive_tip: HiveTipController | None = None,
    field_bounds: FieldBoundsReturn | None = None,
) -> None:
    for _ in range(n):
        if mech is not None:
            mech.update()
            if field_bounds is not None:
                field_bounds.set_protected(mech.protected_body_ids())
        if hive_tip is not None:
            hive_tip.update()
        if field_bounds is not None:
            field_bounds.update()
        apply_drive_slew(model, data)
        mujoco.mj_step(model, data)


def steps_for_seconds(model: mujoco.MjModel, seconds: float) -> int:
    return max(1, int(round(seconds / model.opt.timestep)))


def count_pollen_bodies(model: mujoco.MjModel) -> int:
    n = 0
    for i in range(model.nbody):
        name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, i)
        if name and name.startswith("pollen_"):
            n += 1
    return n


def count_apriltag_sites(model: mujoco.MjModel) -> int:
    n = 0
    for i in range(model.nsite):
        name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_SITE, i)
        if name and name.startswith("apriltag_") and name[9:].isdigit():
            n += 1
    return n


def count_apriltag_geoms(model: mujoco.MjModel) -> int:
    n = 0
    for i in range(model.ngeom):
        name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, i)
        if name and name.startswith("apriltag_geom_"):
            n += 1
    return n


def report_assets(model: mujoco.MjModel) -> str:
    meshes = cad_mesh_status()
    cad_ok = sum(1 for v in meshes.values() if v)
    return (
        f"CAD meshes present: {cad_ok}/{len(meshes)} {meshes}\n"
        f"POLLEN bodies: {count_pollen_bodies(model)}\n"
        f"AprilTag sites: {count_apriltag_sites(model)}  geoms: {count_apriltag_geoms(model)}"
    )
