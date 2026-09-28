# Integration — Blocks + BIOBUZZ

## Who owns physics?

- **Main rAF loop** owns `mj_step` and `SimClock` (same as before).
- **BIOBUZZ world**: each substep runs `BiobuzzHardwareAdapter.physicsTick(dt)` →
  `IntakeShooter.update` → hive tip → field bounds → `updateDriveSlew` → `mj_step`.

## Teleop vs OpMode

| State | Drive / mechanisms |
|-------|--------------------|
| Idle / DONE / ERROR / after STOP | BIOBUZZ `InputHandler` teleop (`applyTeleop`) |
| INIT / WAIT_FOR_START / RUN | Blocks OpMode commands only (`applyCommands`) |

Documented in UI HUD (*Control: Teleop | OpMode*).

## STOP

`OpModeRunner.stop` → worker interrupt + `adapter.zeroAll()`:

- `resetDriveState` + ctrl zeros
- `IntakeShooter.intakePower = 0`, clear shoot queue
- edge-arm flags cleared

Repeated zero within ~250 ms (existing contract).

## World

- Always BIOBUZZ (`/robots/BIOBUZZ/simulation.json`). Simplified world switcher removed.

## Code layout

```
src/worlds/biobuzz/   # loader, renderer, mechanisms, hive_tip, field_bounds, controls, constants
src/mujoco/BiobuzzHardwareAdapter.js
src/mujoco/biobuzzMapping.js
src/main.js           # BIOBUZZ boot, teleop-when-idle, OpMode-when-running
public/assets/        # biobuzz_scene.xml + meshes + textures (copied)
```

## Examples on BIOBUZZ

- **TankDrive** — stick powers → `setTankPower` (feel matches teleop slew).
- **Mechanisms** — soft bridges (see mapping table in README); visible hopper/shoot/place or telemetry.
- **EncoderAuto** — wheel joint encoders still drive RUN_TO_POSITION busy logic.
