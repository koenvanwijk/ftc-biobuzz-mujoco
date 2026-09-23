"""View BIOBUZZ scene only (no drive input)."""

from __future__ import annotations

import sys

import mujoco
import mujoco.viewer

from .sim import (
    count_apriltag_geoms,
    count_apriltag_sites,
    count_pollen_bodies,
    load_model,
    make_field_bounds,
    make_hive_tip,
    make_intake_shooter,
    report_assets,
)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    headless = "--headless" in argv

    model, data = load_model()
    mech = make_intake_shooter(model, data, preload=True)
    hive_tip = make_hive_tip(model, data)
    field_bounds = make_field_bounds(model, data)
    n = count_pollen_bodies(model)
    tags = count_apriltag_sites(model)
    tag_geoms = count_apriltag_geoms(model)
    print(report_assets(model))
    print(f"BIOBUZZ scene geladen — POLLEN: {n} (verwacht 40), AprilTags sites={tags} geoms={tag_geoms}, hopper={mech.count}")
    if n != 40:
        print("WAARSCHUWING: pollen-telling wijkt af!", file=sys.stderr)
    if tags < 16:
        print("WAARSCHUWING: AprilTag sites < 16!", file=sys.stderr)

    if headless:
        for _ in range(200):
            mech.update()
            field_bounds.set_protected(mech.state.stored)
            hive_tip.update()
            field_bounds.update()
            mujoco.mj_step(model, data)
        # Verify meshes loaded (nmesh > 0 if CAD present)
        print(f"Headless smoke-test OK (200 steps) — nmesh={model.nmesh} ntex={model.ntex} hopper={mech.count}")
        return 0 if n == 40 and tags >= 16 else 1

    cam_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, "robot_up_cam")
    print(f"Cameras: free orbit + robot_up_cam id={cam_id} (viewer [ ] cycles fixed cams)")
    with mujoco.viewer.launch_passive(model, data) as viewer:
        # Start on free camera; user can switch to robot_up_cam via MuJoCo viewer UI
        while viewer.is_running():
            mech.update()
            field_bounds.set_protected(mech.state.stored)
            hive_tip.update()
            field_bounds.update()
            mujoco.mj_step(model, data)
            viewer.sync()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
