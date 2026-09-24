# Integration — Blocks + BIOBUZZ

## Who owns physics?

- **Main rAF loop** owns `mj_step` and `SimClock` (same as before).
- **BIOBUZZ world**: each substep runs `BiobuzzHardwareAdapter.physicsTick(dt)` →
  `IntakeShooter.update` → hive tip → field bounds → `updateDriveSlew` → `mj_step`.
- **Simple world**: `HardwareAdapter.applyCommands` then `mj_step` (joint actuators only).

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

## World select

- Query `?world=biobuzz` (default) or `?world=simple`
- Toolbar select reloads with the param
- Config: `/robots/BIOBUZZ/simulation.json` vs `/robots/REVStarterBot2026/simulation.json`

## Code layout

```
src/worlds/biobuzz/   # loader, renderer, mechanisms, hive_tip, field_bounds, controls, constants
src/worlds/simple/    # re-exports existing mujoco loader/renderer/adapter
src/mujoco/BiobuzzHardwareAdapter.js
src/mujoco/biobuzzMapping.js
src/main.js           # world boot, teleop-when-idle, OpMode-when-running
public/assets/        # biobuzz_scene.xml + meshes + textures (copied)
```

## Examples on BIOBUZZ

- **TankDrive** — stick powers → `setTankPower` (feel matches teleop slew).
- **Mechanisms** — soft bridges (see mapping table in README); visible hopper/shoot/place or telemetry.
- **EncoderAuto** — wheel joint encoders still drive RUN_TO_POSITION busy logic.
