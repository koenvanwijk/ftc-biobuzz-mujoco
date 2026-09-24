# FTC Blocks + BIOBUZZ MuJoCo

Browser-app die **officiële FTC Blocks** (vendor offline-editor) combineert met de **BIOBUZZ MuJoCo WASM**-veldscène (hive, flowers, pollen, nectar, robot). Blocks-gegenereerd JavaScript stuurt dezelfde hardware-identifiers als REVStarterBot2026; op BIOBUZZ worden drive-actuators + soft mechanisms gemapt.

De standalone teleop-viewer blijft beschikbaar in `../web` (poort 5173).

## Snel starten (combined)

```bash
cd web-blocks   # from repo root: ftc-biobuzz-mujoco/web-blocks
npm install
npm run dev
```

Open **http://localhost:5174/** (default wereld = BIOBUZZ).  
Fallback: **http://localhost:5174/?world=simple** of kies *Vereenvoudigd* in de toolbar.

### Workflow

1. Wereld: **BIOBUZZ** (default) of **Vereenvoudigd**.
2. Voorbeeld (TankDrive / Mechanisms / EncoderAuto / **ImuAprilTag**) → *Open in editor*.
3. *Code vernieuwen* voor JS/Java.
4. **INIT** → OpMode tot `waitForStart` (sim reset; OpMode owns actuators).
5. **START** / **STOP** — STOP zerot drive + mechanisms; daarna idle teleop weer actief.
6. Export **.blk** / **Java**.

### UI — panelen

De drie panelen (Blocks / Sim / Code) zijn **versleepbaar** via de verticale splits (horizontaal op smalle schermen). Toolbar: **Blocks · Sim · Code · Gelijk** vergroot één paneel of herstelt de standaardverdeling (~40/35/25). Per paneel: **◀** inklappen, **⛶** vergroten. Breedtes en inklapstatus blijven bewaard in `localStorage` (`ftc-blocks-layout-v1`). Na layout-wijziging krijgt de MuJoCo-canvas een resize (window-event + `viewer.resize()`).


### Idle teleop (BIOBUZZ, geen actieve OpMode)

| Input | Actie |
|-------|--------|
| W/S · I/K | Tank L/R |
| ↑/↓ | Tank rechts (zelfde als I/K) |
| A/D of ←/→ | Arcade-bocht (forceert arcade) |
| E / RB | Intake toggle |
| C / LB | Rear FIFO spit (hold) |
| Space/F / RT | Shoot pulse |
| X | Place FIFO → flower |
| T | Tank/arcade toggle |
| R | Reset keyframe + preload |

### OpMode toetsenbord → `gamepad1` overrides

| Input | Override |
|-------|----------|
| W / S | `leftStickY` −1 / +1 |
| I / K of ↑ / ↓ | `rightStickY` −1 / +1 |
| ← / → | `leftStickX` −1 / +1 |
| E | `RightBumper` |
| C | `LeftBumper` |
| X | button `X` |
| Space / F | `rightTrigger` 1 (shoot) |
| G | button `A` |
| B | button `B` |
| Y | button `Y` |
| U / J / H / L | `DpadUp` / `Down` / `Left` / `Right` |

Tijdens INIT/WAIT/RUN heeft de **Blocks OpMode** exclusief actuator-controle. Axis/button overrides worden gewist bij STOP/DONE/ERROR/reset.

## Hardware ↔ BIOBUZZ mapping

| FTC config | JS-id | BIOBUZZ target |
|------------|-------|----------------|
| leftDrive | leftDriveAsDcMotor | actuator `left_drive` via `setTankPower` + `updateDriveSlew` |
| rightDrive | rightDriveAsDcMotor | actuator `right_drive` (idem) |
| intakeMotor | intakeMotorAsDcMotor | `IntakeShooter.intakePower` — `>0.05` intake aan; `<−0.05` rear spit |
| flywheel | flywheelAsDcMotor | **rising edge** `|power|>0.3` → `IntakeShooter.fire()` |
| pollenServo | pollenServoAsServo | **rising edge** `position01>0.7` → `tryPlaceNectar()` |
| crServo | crServoAsCRServo | `|power|>0.3` forceert rear eject (zoals hold C) |
| Voltage / hub | … | stubs ongewijzigd |
| imu | imuAsIMU | **Simulated** body yaw/pitch/roll (zie `extensions.md`) |
| Webcam 1 | aprilTagAccess / visionPortalAccess | **Simulated** AprilTags op BIOBUZZ; geen CV |

Details: `robots/BIOBUZZ/simulation.json`. Soft devices hebben geen MJCF-joint; encoders voor flywheel/intake blijven 0 (commando’s in telemetry/HUD).

Wheel-encoders (`left_wheel_j` / `right_wheel_j`) blijven beschikbaar voor EncoderAuto / RUN_TO_POSITION.



## GitHub Pages

Production build is deployed from this folder to:

**https://koenvanwijk.github.io/ftc-biobuzz-mujoco/**

Workflow: `.github/workflows/deploy-pages.yml` (`VITE_BASE=/ftc-biobuzz-mujoco/`).

Local production-base preview:

```bash
VITE_BASE=/ftc-biobuzz-mujoco/ npm run build
npx vite preview --host 0.0.0.0 --port 5174
# open http://localhost:5174/ftc-biobuzz-mujoco/
```

## Scripts

| Script | Betekenis |
|--------|-----------|
| `npm run dev` | Vite op **5174** |
| `npm run build` | Productiebuild |
| `npm test` | Unit/integratietests |
| `npm run smoke` | Artifacts + tests + BIOBUZZ WASM smoke |

## Documentatie

- `INTEGRATION.md` — physics-eigenaar, teleop vs OpMode, STOP
- `ARCHITECTURE.md` — threads, klok, worker
- `SUPPORT_MATRIX.md` — working / partial / unsupported (+ soft mechanisms)
- `robots/BIOBUZZ/` · `robots/REVStarterBot2026/`

## Assets

BIOBUZZ XML/meshes/textures zijn **gekopieerd** naar `public/assets/` (bron: `ftc-biobuzz-mujoco/web/public/assets`). World-code staat in `src/worlds/biobuzz/` (copy, geen cross-project import).

## Belangrijke aannames

- Physics is niet gevalideerd tegen een echte robot.
- BIOBUZZ intake/shoot/place zijn **soft bridges**, geen pure joint-actuators.
- MJCF *simple* blijft een vereenvoudigd fallback-model.
- IMU + Webcam/AprilTag zijn **expliciete simulator-extensies** (toolbox + runtime); geen stille placeholders — details in `src/config/extensions.md`.
