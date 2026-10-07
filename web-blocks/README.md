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


### Spelregels & score (Competition Manual TU03)

- **HIVE-kantelregel** (Event Field Setup Guide §12.3): de omhoog-CELL kantelt bij **8 POLLEN** of **3 NECTAR + 3 POLLEN** (puur op aantallen; meer mag ook). Houdt bij o.a. 7 POLLEN, 3 NECTAR + 2 POLLEN en 6 NECTAR zonder POLLEN. Elke NECTAR in de CELL telt mee (ook vrijgegeven extra's en de andere kleur). Bij de start liggen er al 3 NECTAR in elke omhoog-CELL, dus **3 gelanceerde POLLEN kantelen de HIVE**. `shouldTip()` in `src/worlds/biobuzz/hive_tip.js`.
- **G407**: de robot controleert nooit meer dan **4** SCORING ELEMENTS (voorhopper + achtercompartiment samen; `ROBOT_CONTROL_LIMIT`). Bij 4 pakt de intake niets meer op; ballen blijven liggen of worden weggeduwd. Gelanceerde, uitgespuugde of in een FLOWER geplaatste elementen tellen niet meer. De robot start met de **4 preload-POLLEN** (G304.G) en is dus vol: eerst schieten. HUD: **Robot x / 4** (oranje als vol).
- **Score** (§10.5, Table 10-2 / 10-3), paneel linksboven in het simbeeld en `window.__ftcSim.score()` (read-only):
  - **HIVE TIP** 20 — live, per TIP van de eigen HIVE.
  - **In CELL** 2, **BLOEM eigenaar** 2 per element, **Onderste NECTAR** +5, **GARDEN** 1 — uit de huidige veldtoestand ("als de wedstrijd nu eindigt"). Alleen elementen die stilliggen (|v| < 0,05 m/s) en niet in de robot zitten; zolang er nog iets rolt staat dat onder de tabel. FLOWER: elementen (deels) tussen de middelste ring (≈ 10 cm: onderring 1,0 cm + Retrieval Opening 9,0 cm, §9.7) en de bovenrand (54,6 cm); eigenaar = alliantie van de bovenste NECTAR, bonus = alliantie van de onderste. GARDEN/CELL zijn alliantie-gebonden, ongeacht wie het element plaatste.
  - **Zonder wedstrijdklok** (bewust nog niet gebouwd) zijn de fase-afhankelijke regels **indicatief** (met * in het paneel): **LEAVE*** (3) vergrendelt zodra de robot (omhullende van alle botsende geoms, incl. de achter-intake) ≥ 3 cm van elke muur staat en blijft staan tot *Reset sim*; **PARK*** (5) = "als nu geparkeerd": robot nu (deels) in de eigen LOADING ZONE (TELEOP PARK). **AUTO PARK**, **WIN/TIE** en **fouten/penalty's** (§10.6–10.8) worden niet gescoord. **SWARM RP*** = LEAVE + PARK ≥ 16 (met één robot max. 8, dus nooit), **POLLINATOR RP** bij ≥ 4 / ≥ 7 TIPS.
  - De robot hoort bij **rood** (start op de rode helft). Let op: de huidige startpose ligt deels in onze (nog niet volgens §9 geplaatste) LOADING ZONE, dus PARK* toont bij de start al 5 (G304.E zegt: niet in de LOADING ZONE starten).
  - Code: `src/worlds/biobuzz/scoring.js` (puur `computeScore()` + `BiobuzzScorer`), paneel `src/ui/scorePanel.js`; tests `tests/unit/biobuzzRules*.test.js`.

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
| Webcam 1 | aprilTagAccess / colorBlobLocatorAccess / visionPortalAccess | **Simulated** AprilTags en gele POLLEN-color-blobs op BIOBUZZ; geen CV. Camera = **Logitech Brio 4K** (zie hieronder) |

Details: `robots/BIOBUZZ/simulation.json`. Soft devices hebben geen MJCF-joint; encoders voor flywheel/intake blijven 0 (commando’s in telemetry/HUD).

Wheel-encoders (`left_wheel_j` / `right_wheel_j`) blijven beschikbaar voor EncoderAuto / RUN_TO_POSITION.

### Robotcamera: Logitech Brio 4K

De robotcamera (`robot_up_cam`) volgt de echte **Logitech Brio 4K**: diagonaal zichtveld **90°** (standaard), **78°** of **65°** (zoals in Logi Tune / G HUB), native 16:9. FTC streamt standaard **640×480** (4:3): een uitsnede die het verticale zichtveld behoudt.

| Preset (diagonaal) | Verticaal | Horizontaal 16:9 (1280×720) | Horizontaal 4:3 (640×480) |
|---|---|---|---|
| 90° (standaard) | 52,2° | 82,1° | 66,3° |
| 78° | 43,3° | 70,4° | 55,8° |
| 65° | 34,7° | 58,1° | 45,2° |

- **Eén bron:** `simulation.json` → `webcam.camera` (model, `dfovPresetsDeg`, `defaultDfovDeg`, resolutie); H/V worden in code afgeleid (`src/mujoco/robotCamera.js`, unit-getest). Dezelfde waarden sturen het PiP-camerabeeld (Three.js `robotCam`), de frustum-piramide, de AprilTag-detectie en de POLLEN-kleur-blob-detectie (`computePollenColorBlobs`: zelfde H × V, beeldmaat = streamresolutie, ook voor unity-ROI's).
- **Keuzelijst "Camera-zichtveld"** in de sim-HUD; keuze bewaard in `localStorage` (`ftc-sim-camera-dfov-v1`). Wisselen werkt direct.
- **Zichtbaarheid = rechthoekig frustum:** |horizontale hoek| ≤ H/2 én |verticale hoek| ≤ V/2 in het cameraframe (niet langer een kegel), plus bereik 2,5 m en facing-drempel.
- **`setCameraResolution`** (VisionPortal.Builder) stuurt de resolutie naar de sim; 1280×720 geeft dus 16:9 met het volle horizontale zichtveld. Terug naar 640×480 bij de volgende INIT of *Reset sim*.
- MJCF `fovy` van `robot_up_cam` = 52,2 (verticaal bij 90°); bij een andere preset wordt `model.cam_fovy` bijgewerkt. Het PiP-beeld komt uit de Three.js-camera, niet uit de MuJoCo-renderer.
- **Portret (standaard):** `webcam.camera.orientation` = `"portrait"` (camera 90° om de lens gedraaid) of `"landscape"`; vinkje **Portret** naast de keuzelijst schakelt direct (bewaard in `localStorage`, `ftc-sim-camera-orientation-v1`). Rechtop is het beeld dan 52,2° × 66,3° (480×640; bij 1280×720: 52,2° × 82,1°). `cameraFov()` geeft het sensorframe (`hfovDeg`/`vfovDeg`/`width`/`height`, ongewijzigd) én het rechtop gezette beeld (`viewHfovDeg`/`viewVfovDeg`/`viewAspect`/`viewWidth`/`viewHeight`, verwisseld).
  - De rol zit in de montage (`mountQuat(pitch, roll)`), dus site/camera `robot_up_cam` draaien mee: de frustum-piramide en de AprilTag-/POLLEN-detectie werken in het **sensorframe** (640×480, beeld-X = lange kant, wijst omhoog). Zo levert de FTC-SDK het ook aan (VisionPortal draait een gedraaide webcam niet terug): blob-X = wereld-verticaal (klein = onder), blob-Y = wereld-horizontaal (klein = links), ROI's in datzelfde frame, `ftcPose` x/z gedraaid.
  - Het PiP-beeld draait de rol terug en is daardoor rechtop en smal-hoog (3:4 / 9:16).
- **Camerapositie:** `webcam.camera.mount` = `{ x, y, z, pitchDeg, rollDeg }` in het robotframe (z vanaf de robot-oorsprong; lens boven de mat ≈ z + 0,044 m; `rollDeg` 90 = portret, −90 = andersom; zonder `rollDeg` volgt die uit `orientation`). Wordt bij het laden op site + camera `robot_up_cam` gezet (`applyCameraMount`), dus PiP, frustum, AprilTag- en POLLEN-detectie volgen. Ontbrekende velden = standaardmontage.
- **Standaard: portret, lens 16,5 cm boven de mat, +17,5°, 90°, 640×480** → `mount: { "x": 0.24, "y": 0, "z": 0.121, "pitchDeg": 17.5, "rollDeg": 90 }` (vóór de intake; bijgesteld t.o.v. #22 zodat nabije POLLEN niet onder het beeld vallen). Geometriestudie op de echte scène (raster 5 cm × 72 richtingen, tag gezien = in het frustum, ≤ 2,5 m, facing ≥ 0,55; vloer = POLLEN-midden in frustum; occlusie genegeerd):

  | Montage | Onderrand | Vloer vanaf | Tag 1,25 m vanaf | Veldposities | Poses | Afstand tot tags (p5–p95) | Schietzone gedekt |
  |---|---|---|---|---|---|---|---|
  | **portret 16,5 cm, +17,5° (standaard)** | −15,7° | 0,46 m | 0,88 m | **61 %** | 8,9 % | ~0,88–1,6 m | **95 %** |
  | portret 18,5 cm, +22,5° (PR #22) | −10,7° | 0,79 m | 0,72 m | 72 % | 11,4 % | 0,76–1,62 m | 96 % |
  | liggend, 18,5 cm / +22,5° | −3,6° | 2,36 m | 0,93 m | 0 % | 0 % | — | 0 % |
  | liggend laag 6,5 cm, +22,5° (`z: 0.021`) | −3,6° | 0,47 m | 1,04 m | 55 % | 9,6 % | 1,07–1,77 m | 93 % |
  | oud: liggend 32,4 cm, +39,7° (MJCF-pose) | +13,6° | nooit | 0,41 m | 0 % | 0 % | — | 0 % |

  "Schietzone" is een **aanname**: de posities van waaruit de sim-shooter (5,7 m/s, 75°) een POLLEN in een omhoog-CELL krijgt (MuJoCo-schoten op een 10 cm-raster; afstand tot de CELL-opening ±1,06–1,54 m); dekking = robot richt op de CELL en ziet vloer + ≥ 1 tag van die CELL. Er is geen schietzone in de repo of de spelregels hier gedefinieerd. Portret maakt een hogere, praktische montage mogelijk: op 18–35 cm haalt portret 480×640 nog ±62–75 % van de posities, liggend maar 21–44 %. Met 1280×720 portret (+32,5°) ±95 %. De MJCF-pose van `robot_up_cam` is ongewijzigd (oude pose, `LEGACY_CAMERA_MOUNT`); de standaard komt uit `simulation.json` / `DEFAULT_CAMERA_MOUNT`.
- Niet gemodelleerd: lensvervorming, autofocus/zoom (Brio digitale zoom/RightLight), exacte sensor-uitsnede per resolutie.



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
- IMU + Webcam/AprilTag/ColorBlobLocator zijn **expliciete simulator-extensies** (toolbox + runtime); geen stille placeholders — details in `src/config/extensions.md`.
