# Architectuur

## Overzicht

```
┌──────────────────────────┐     postMessage      ┌─────────────────────────┐
│ UI (main)                │◄────────────────────►│ Vendor iframe           │
│  - toolbar INIT/START    │   get JS/Java/.blk   │  FtcOfflineBlocks*.html │
│  - telemetry / logs      │                      │  setOnline(false)       │
│  - Three.js canvas       │                      └─────────────────────────┘
└──────────┬───────────────┘
           │ commands / sensors / clock / gamepads
           ▼
┌──────────────────────────┐     Worker messages  ┌─────────────────────────┐
│ MuJoCo physics loop      │◄────────────────────►│ OpMode Worker           │
│  - mj_step owns time     │                      │  JS-Interpreter         │
│  - HardwareAdapter       │                      │  budget 5000 steps/slice│
│  - velocity/position ctrl│                      │  async sleep/waitStart  │
└──────────────────────────┘                      └─────────────────────────┘
```

## Generated JS-contract (vendor)

Bevindingen uit `vendor/ftc-blocks`:

- Identifiers: `makeIdentifier(configName) + suffix` → o.a. `leftDriveAsDcMotor`.
- `generateJavaScriptCode()` (`blocks/vars.js`) wrapt Blockly-output + `// IDENTIFIERS_USED=...`.
- `generateJavaCode()` in `FtcBlocks_common.js`.
- Motors: `setPower` / `getPower` / `setDirection` / `setMode` / `setDualPower(...)` / `isBusy` / `setVelocity` / …
- Enums als strings: `"FORWARD"`, `"RUN_TO_POSITION"`, …
- `linearOpMode.waitForStart/sleep/idle/opModeIsActive/...`
- Telemetry: `telemetry.addNumericData` + globale `telemetryAddTextData`.
- Helpers: `startBlockExecution` / `endBlockExecution` / `listLength(miscAccess, list)`.
- Offline DB: IndexedDB `FtcBlocksDatabase` → **gepatched** naar `FtcBlocksDatabase_MuJoCoSim`.

## Threads & klok

- **Physics (main rAF-loop)** is eigenaar van `SimClock`: elke `mj_step` doet `clock.advance(timestep)`.
- **Worker** ontvangt `clock`-messages met `timeSec` + sensor-snapshot + gamepads.
- `sleep(ms)` / `idle()` / timers gebruiken **alleen** simulatietijd (JS-Interpreter `createAsyncFunction`), niet `setTimeout` wall-clock. Physics blijft lopen tijdens waits.

## INIT / START / STOP

| Fase | Gedrag |
|------|--------|
| INIT | Sim reset, commands gewist, worker start `runOpMode()` tot `waitForStart` |
| START | Worker hervat async `waitForStart`; `opModeIsActive() === true` |
| STOP | `stop`-message; async callbacks geforceerd; `ctrl` → 0; herhaalde zero ≤ ~250 ms |

Geen restanten: `resetAll` + `adapter.resetPose` + lege command-buffer bij nieuwe INIT.

## Sensor-timing vs physics

- Encoders/velocity worden **per physics-stap** uit `qpos`/`qvel` berekend.
- De worker ziet de **laatste snapshot** bij de volgende clock-tick (≈ 1 frame). Geen intra-step reads.
- `RUN_TO_POSITION` busy-vlag: `|target - positie| > tolerance`.

## Actuator-mapping

- Drive / flywheel / intake / CRServo: **velocity actuators** — `ctrl = power * maxRadPerSec` (niet raw power in `data.ctrl`).
- pollenServo: **position actuator** — `ctrl = angleRad` uit positie 0..1 + `scaleRange`.
- BRAKE vs FLOAT: beide zetten velocity-ctrl op 0; FLOAT is een gedocumenteerde benadering (geen runtime kv-wissel).

## Uitbreidingen (camera / IMU)

IMU (`imuAsIMU`) en Webcam/Vision (`aprilTagAccess`, `visionPortalAccess`, `yawPitchRollAnglesAccess`) zijn **enabled als simulated extensions** (vendor dropdown/toolbox patch + runtime bridges). Zie `src/config/extensions.md` en `vendor/ftc-blocks/PATCHES.md`. `parseHardwareConfigXml` rapporteert nog steeds `missingSimBindings` voor overige devices zonder sim-brug.


## BIOBUZZ combine (2026)

Default world loads BIOBUZZ MJCF + soft mechanisms via `BiobuzzHardwareAdapter`.
See `INTEGRATION.md` for teleop-vs-OpMode ownership and STOP zeroing.
Fallback `world=simple` keeps the original REVStarterBot2026 joint adapter.
