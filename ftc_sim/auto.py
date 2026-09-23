"""Run sample autonomous OpMode."""

from __future__ import annotations

import sys
import time

import mujoco
import mujoco.viewer

from .auto_modes import DEFAULT_AUTO
from .sim import count_pollen_bodies, load_model, make_field_bounds, make_hive_tip, make_intake_shooter, report_assets


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    headless = "--headless" in argv
    # realtime pacing off for faster CI/smoke unless --realtime
    realtime = "--realtime" in argv

    model, data = load_model()
    mech = make_intake_shooter(model, data, preload=True)
    hive_tip = make_hive_tip(model, data)
    field_bounds = make_field_bounds(model, data)
    print(report_assets(model))
    print(f"Auto — POLLEN: {count_pollen_bodies(model)} hopper={mech.count}")
    print(f"OpMode: {DEFAULT_AUTO.__name__}")

    if headless:
        viewer_sync = None
        op = DEFAULT_AUTO(model, data, on_step=None, realtime=False)
        op.mech = mech
        op.hive_tip = hive_tip
        op.field_bounds = field_bounds
        t0 = time.perf_counter()
        op.run()
        robot_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "robot")
        pos = data.xpos[robot_id].copy()
        print(f"Headless auto klaar in {time.perf_counter()-t0:.2f}s — robot pos=({pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f})")
        return 0

    with mujoco.viewer.launch_passive(model, data) as viewer:
        def on_step() -> None:
            viewer.sync()
            if not viewer.is_running():
                op.request_op_mode_stop()

        op = DEFAULT_AUTO(model, data, on_step=on_step, realtime=realtime or True)
        op.mech = mech
        op.hive_tip = hive_tip
        op.field_bounds = field_bounds
        # Run auto in-thread while viewer active
        op.run()
        # Keep viewer open briefly after
        end = time.perf_counter() + 2.0
        while viewer.is_running() and time.perf_counter() < end:
            mujoco.mj_step(model, data)
            viewer.sync()
            time.sleep(model.opt.timestep)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
