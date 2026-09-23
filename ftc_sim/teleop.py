"""Gamepad / keyboard teleop entry point."""

from __future__ import annotations

import sys
import time

import mujoco
import mujoco.viewer

from .controls import InputHandler
from .sim import (
    apply_drive_slew,
    count_apriltag_sites,
    count_pollen_bodies,
    load_model,
    make_field_bounds,
    make_hive_tip,
    make_intake_shooter,
    report_assets,
    reset_drive_state,
    set_tank_power,
)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    headless = "--headless" in argv
    duration = 2.0
    for a in argv:
        if a.startswith("--seconds="):
            duration = float(a.split("=", 1)[1])

    model, data = load_model()
    mech = make_intake_shooter(model, data, preload=True)
    hive_tip = make_hive_tip(model, data)
    field_bounds = make_field_bounds(model, data)
    print(report_assets(model))
    print(f"Hopper preload: {mech.count} pollen")
    print("Besturing: tank W/S+I/K; E=intake; SPACE/F=shoot; X=nectar in bloem; G=bloemen vullen; T=arcade; R=reset; Esc=stop")
    cam_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, "robot_up_cam")
    print(f"robot_up_cam id={cam_id} — switch via viewer fixed-camera controls")

    if headless:
        # Smoke: drive + intake ON + shoot pulses
        set_tank_power(model, data, 0.4, 0.4)
        mech.set_intake_power(1.0)
        steps = int(duration / model.opt.timestep)
        fired = 0
        for i in range(steps):
            if i in (int(0.4 / model.opt.timestep), int(0.9 / model.opt.timestep), int(1.4 / model.opt.timestep)):
                if mech.fire():
                    fired += 1
            mech.update()
            field_bounds.set_protected(mech.protected_body_ids())
            hive_tip.update()
            field_bounds.update()
            apply_drive_slew(model, data)
            mujoco.mj_step(model, data)
        robot_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "robot")
        x = float(data.xpos[robot_id][0])
        print(
            f"Headless teleop smoke: robot x={x:.3f} m after {duration}s; "
            f"shots={fired}; hopper_left={mech.count}; "
            f"tags={count_apriltag_sites(model)}; pollen={count_pollen_bodies(model)}"
        )
        return 0

    controls = InputHandler()
    try:
        with mujoco.viewer.launch_passive(model, data) as viewer:
            while viewer.is_running():
                cmd = controls.poll()
                if cmd.quit:
                    break
                if cmd.reset:
                    mujoco.mj_resetDataKeyframe(model, data, 0)
                    mujoco.mj_forward(model, data)
                    mech.reset_and_preload()
                    hive_tip.reset()
                    reset_drive_state()
                set_tank_power(model, data, cmd.left, cmd.right)
                mech.set_intake_power(cmd.intake)
                if cmd.shoot:
                    ok = mech.fire()
                    print(f"[shoot] {'OK' if ok else 'leeg'} — hopper={mech.count}")
                if cmd.place_nectar:
                    result = mech.try_place_nectar()
                    print(f"[rear] {result} — achter={mech.rear_count}")
                step_start = time.perf_counter()
                mech.update()
                field_bounds.set_protected(mech.protected_body_ids())
                hive_tip.update()
                field_bounds.update()
                if hive_tip.state.last_event:
                    print(f"[hive] {hive_tip.state.last_event}")
                    print(
                        f"[score] red={hive_tip.state.score['red']} "
                        f"blue={hive_tip.state.score['blue']}"
                    )
                    hive_tip.state.last_event = ""
                apply_drive_slew(model, data)
                mujoco.mj_step(model, data)
                viewer.sync()
                leftover = model.opt.timestep - (time.perf_counter() - step_start)
                if leftover > 0:
                    time.sleep(leftover)
    finally:
        controls.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
