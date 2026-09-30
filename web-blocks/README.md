# FTC Blocks + BIOBUZZ MuJoCo

Browser-app die **officiële FTC Blocks** (vendor offline-editor) combineert met de **BIOBUZZ MuJoCo WASM**-veldscène (hive, flowers, pollen, nectar, robot). Blocks-gegenereerd JavaScript stuurt dezelfde hardware-identifiers als REVStarterBot2026; op BIOBUZZ worden drive-actuators + soft mechanisms gemapt.

De standalone teleop-viewer blijft beschikbaar in `../web` (poort 5173).

## Snel starten (combined)

```bash
cd web-blocks   # from repo root: ftc-biobuzz-mujoco/web-blocks
npm install
npm run dev
```

Open **http://localhost:5174/** (BIOBUZZ-veld).

### Workflow

1. Voorbeeld (TankDrive / Mechanisms / EncoderAuto / **ImuAprilTag**) → *Open in editor*.
2. *Code vernieuwen* voor JS/Java.
3. **INIT** → OpMode tot `waitForStart` (sim reset; OpMode owns actuators).
4. **START** / **STOP** — STOP zerot drive + mechanisms; daarna idle teleop weer actief.
5. Export **Java** (optioneel).

### Debugger (stap voor stap door je blokken)

Zet **Debug** aan in de toolbar (vóór **INIT**). Daarna pauzeert de OpMode bij het eerste blok; het huidige blok krijgt een **gele rand** in de Blocks-editor en de run-status toont *Gepauzeerd bij blok: …*.

| Knop | Werking |
|------|---------|
| **Stap** | voert het volgende blok uit en pauzeert weer (werkt in INIT én na START; ook in `opModeIsActive`-loops). **Stapt in** aangeroepen procedures/functies (`procedures_callnoreturn` / `procedures_callreturn`): de blokken van de functie worden één voor één gemarkeerd (eerst het `to …`-definitieblok, dan de inhoud) |
| **Stap over** | voert het huidige blok uit; is dat een functie-aanroep dan draait de **hele functie in één keer** en pauzeert de debugger bij het volgende blok in hetzelfde functieniveau. **Breakpoints binnen die functie pauzeren wél** (en ook **Pauzeer**). Op een gewoon blok (geen aanroep) doet Stap over hetzelfde als Stap |
| **Stap uit** | draait door tot de huidige functie terugkeert en pauzeert bij het volgende blok in de aanroeper (breakpoints blijven pauzeren). Alleen actief binnen een functie (niet in `runOpMode` zelf) |
| **Doorgaan** | draait door tot een breakpoint, **Pauzeer** of het einde |
| **Pauzeer** | pauzeert bij het eerstvolgende blok (ook tijdens `sleep`/`idle`/`waitForStart`) |
| **● Breakpoint** | selecteer een statement-blok in de editor en klik: breakpoint aan/uit (rode stippelrand); **Wis BP** verwijdert alles |
| **STOP** | werkt ook tijdens een pauze (zerot motoren, wist highlight) |

**Tijdens een pauze staat de simulatie stil**: de OpMode is bevroren én de fysica + simtijd lopen niet door. Motoren houden hun laatste commando (het zit in de bevroren sim), telemetry blijft zichtbaar. Bij *Stap* verstrijkt geen simtijd tenzij het blok een wacht bevat (`sleep`, `idle`, `waitForStart`): dan loopt de sim tot de wacht klaar is en pauzeert daarna bij het volgende blok.

#### Variabelen

Bij elke pauze toont het paneel **Variabelen** alle huidige variabelen met hun waarde (`lok` = lokaal in de functie, `glob` = globaal; functies, ingebouwde objecten en de simulator-API's worden niet getoond). Kleuren: **geel** = variabele die het *vorige* blok net zette (`variables_set`, `math_change`, for-teller) — de waarde is dus die **ná** uitvoeren; **blauw** = variabele die het *huidige* (nog niet uitgevoerde) blok leest (`variables_get` in zijn invoer). De statusregel toont alleen fase + blokbeschrijving (max. 48 tekens); de `naam = waarde` van het laatst gezette/gelezen blok staat in de tooltip (`title`) van de statusregel. Na **Stap**/**Doorgaan** worden de waarden grijs (verouderd) tot de volgende pauze. Waarden worden veilig geserialiseerd: getallen, tekst (afgekapt op 60 tekens), booleans, arrays/objecten (max. 8 items, 2 niveaus diep, cycli → `[cyclisch]`), functies worden overgeslagen. 
**Hover in de editor:** tijdens een pauze toont de muis boven een blok in de Blocks-editor een klein tooltip-kader bij de cursor met de waarde van de variabelen in de *eigen velden* van dat blok (`variables_get`, `variables_set`, `math_change`, for-teller, for-each — bijv. `totaal = 36`; meerdere variabelen = meerdere regels). Bronnen: de laatste variabelen-snapshot van de worker (dezelfde als het paneel) en een `mousemove`-handler in de vendor-iframe die het blok via `g[data-id]` opzoekt (geen Blockly-bubbel/warning-API, geen vendor-patch). Het kader verdwijnt bij Stap/Doorgaan/STOP/Debug uit (alleen actief bij pauze). Waarde-blokken *binnen* een blok (bijv. de `totaal` in `totaal + i`) hebben zelf een tooltip; hover er dus direct boven. Muis over een rij in het paneel **Variabelen** omrandt (blauw) alle blokken die die variabele gebruiken. Pure logica (blok → variabelen → tekst): `src/editor/varHover.js` (`tests/unit/varHover.test.js`).

**Toolbar-layout:** de statusregel (`#runStatus`) staat op een eigen rij met vaste hoogte, `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`; de volledige tekst staat in `title`. Lange tekst verschuift dus nooit knoppen. De uitleg-hint is vervallen (staat nu in de `title` van het Variabelen-paneel). Het Variabelen-paneel is één compacte rij met vaste hoogte die altijd gereserveerd is (onzichtbaar via `visibility` als Debug uit staat; de debug-knoppen blijven met `visibility:hidden` gereserveerd en de rij heeft een vaste `min-height`; zonder pauze staat er een placeholder), zodat de layout niet springt. Knoppen-rijen wrappen bij smalle vensters.

**Diepte / Stap over — hoe het werkt:** de aanroepdiepte (`callDepth` in `debugController.js`) is het aantal *lopende* aanroepen van gebruikersfuncties op de `stateStack` van de JS-Interpreter (CallExpression-states met `doneExec_` en een functie met AST-body; native functies zoals `highlightBlock` tellen niet). Dat komt direct uit de echte call-stack en blijft dus juist bij recursie, `return` en fouten. `runOpMode` = diepte 1, een procedure daarin = 2, enz. *Stap over* pauzeert bij het eerstvolgende blok met diepte ≤ de huidige, *Stap uit* bij diepte < de huidige. De worker geeft `highlightBlock` die diepte mee en stuurt bij elke pauze `depth`, `prevBlockId` en `vars` naar de hoofdthread.

Implementatie: Debug gebruikt aparte JS (`getDebugJavaScript()` in `blocksBridge.js`) met `highlightBlock('<id>');` vóór elk statement-blok (Blockly `STATEMENT_PREFIX`, tijdelijk gezet en direct hersteld). De normale Run, het JS-paneel en de Java-export blijven ongewijzigd. Geen vendor-patch nodig. Logica: `public/execution/debugController.js` (getest in `tests/unit/debugController.test.js`).

Voorbeeld **DebugDemo** (variabelen + procedure) in de voorbeeldlijst is bedoeld om Stap / Stap over / Stap uit en het Variabelen-paneel te proberen.

Niet inbegrepen (nog): eigen watch-expressies, variabelen aanpassen tijdens een pauze, conditionele breakpoints, breakpoints die een herlaad van het project overleven. Breakpoints gelden voor de volgende INIT en worden ook live doorgegeven tijdens een sessie.

> **Na worker-wijzigingen** (`public/execution/*.js`, ook `debugController.js`): hard refresh met **Ctrl+Shift+R** — de browser cachet Web Worker-scripts agressief. `src/execution/opModeWorker.js` moet identiek blijven aan `public/execution/opModeWorker.js` (de test controleert dit).

### Help

De **Help**-knop (rechts in de werkbalk) opent een in-app naslagvenster in het Nederlands: panelen, knoppen, sneltoetsen, ondersteunde blokken, debugger en een stapsgewijs TankDrive-voorbeeld. Sluiten met **Esc**, ✕ of een klik naast het venster; werkbalk en sim blijven onaangetast. De inhoud staat per sectie in `src/help/sections/*.js` (de debugger-sectie verschijnt alleen als `#btnDebug` bestaat); de sneltoetstabel wordt door `tests/unit/helpContent.test.js` tegen `src/main.js` en `controls.js` gecontroleerd. Wijzig je toetsen of knoppen, pas dan ook de Help-sectie aan.

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

## Drive polarity (echte robot)

Op de echte robot rijdt de default Blocks-config `leftDrive.setDirection(REVERSE)` +
`rightDrive.setDirection(FORWARD)` met **positieve power op beide motoren vooruit**.
De sim volgt dat: `simulation.json` heeft `leftDrive.defaultDirection = REVERSE`,
`rightDrive.defaultDirection = FORWARD` (zonder setDirection-blokken gelden deze defaults;
een `setDirection`-blok overschrijft ze). `BiobuzzHardwareAdapter` past na FTC-Direction
`LEFT_DRIVE_SIGN = -1` / `RIGHT_DRIVE_SIGN = +1` toe (`electricalToWheelSticks`) om van
elektrisch motorvermogen naar logische wielrichting te gaan; encoders van de linker motor
worden in hetzelfde (gespiegelde) frame gerapporteerd. Idle-teleop en `web/` gebruiken
`setTankPower` met logische sticks en worden **niet** geïnverteerd.

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
- IMU + Webcam/AprilTag zijn **expliciete simulator-extensies** (toolbox + runtime); geen stille placeholders — details in `src/config/extensions.md`.
