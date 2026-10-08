# FTC BIOBUZZ 2026–2027 — MuJoCo simulator

Complete MuJoCo-simulatie van het FIRST Tech Challenge seizoen **BIOBUZZ** (2026–2027):
veld (12×12 ft), officiële Field CAD meshes (HIVE + FLOWERS), AprilTags op HIVE CELLS,
40 POLLEN, tank-drive robot met **front intake + arc shooter**, HIVE tipping, gamepad/keyboard teleop,
en een REV Blocks-achtige autonome laag.

## Installatie

```bash
cd /workspace/ftc-biobuzz-mujoco
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

## Starten

```bash
source .venv/bin/activate
export MUJOCO_GL=glfw   # interactief op deze box; headless smoke: zelfde of egl/osmesa

# Alleen scene bekijken
python -m ftc_sim.viewer

# Teleop (gamepad of toetsenbord)
python -m ftc_sim.teleop

# Sample autonome OpMode
python -m ftc_sim.auto

# Headless smoke-tests
python -m ftc_sim.viewer --headless
python -m ftc_sim.teleop --headless --seconds=2
python -m ftc_sim.auto --headless
```

## Browser (MuJoCo WASM)

Interactieve web-app met dezelfde scene, physics in officiële `@mujoco/mujoco` WASM,
Three.js-rendering, keyboard/gamepad teleop + Autonoom-knop.

```bash
cd /workspace/ftc-biobuzz-mujoco/web
npm install
npm run dev -- --host 0.0.0.0 --port 5173
# Open http://localhost:5173/  ·  smoke: npm run smoke
```

Details: [`web/README.md`](web/README.md). De Python-sim blijft ongewijzigd.


## Browser: FTC Blocks + BIOBUZZ (combined)

Combined **FTC Offline Blocks** editor + BIOBUZZ MuJoCo field lives in [`web-blocks/`](web-blocks/).

```bash
cd web-blocks
npm install
npm run dev
# http://localhost:5174/
```

GitHub Pages (built from `web-blocks/` via Actions):  
**https://koenvanwijk.github.io/ftc-biobuzz-mujoco/**

The teleop-only WASM app in [`web/`](web/) is unchanged (port 5173).

### Spelregels (Competition Manual TU03)

- **HIVE kantelt** bij **8 POLLEN** of **3 NECTAR + 3 POLLEN** in de omhoog-CELL (Event Field Setup Guide §12.3) — in `web-blocks/`, `web/` en `ftc_sim/`.
- **G407** (max 4 elementen per robot, voor + achter samen; start = 4 preload-POLLEN, G304.G) en de **score** per alliantie volgens §10.5 / Table 10-2 / 10-3 (zonder wedstrijdklok; LEAVE/PARK/SWARM indicatief, geen fouten) zitten alleen in `web-blocks/` — zie [`web-blocks/README.md`](web-blocks/README.md#spelregels--score-competition-manual-tu03). De Python-sim en `web/` houden de oude hopper (8 + 4) en tellen alleen TIPs.


## Besturing (teleop)

| Input | Actie |
|-------|--------|
| Linker stick Y / `W` `S` | Linker track |
| Rechter stick Y / `I` `K` | Rechter track |
| Arcade: `WASD` / pijltjes | Throttle + bocht |
| **Right bumper / `E`** | **Intake toggle** (standaard AAN) |
| **Left bumper / `C`** | FIFO uit achtercompartiment (ingedrukt) |
| **Right trigger / `SPACE` of `F`** | **Shoot één pollen** (impuls, voorhopper) |
| **`X` / gamepad X** | FIFO achter → bloem-stack (nectar of pollen); anders op veld laten vallen |
| **`G` / knop “Bloemen vullen”** | End-game: pollen opnieuw in bloemen (planted stack blijft) |
| `T` | Wissel tank ↔ arcade |
| `R` | Reset naar startpose (+ 4 preload in hopper) |
| `Esc` / `Q` | Stop |

### Intake + arc shoot + achtercompartiment / bloemen

- **Front intake** (+X): POLLEN → voorhopper (shooter), max 8; **4 preload** starten daar. (In `web-blocks/`: max 4 elementen samen, G407.)
- **Rear intake** (-X): NECTAR én POLLEN → achtercompartiment (FIFO gemengd), max 4.
- **Shooter**: `SPACE`/`F` lanceert één pollen uit de voorhopper (`SHOOT_SPEED` 5.7 m/s, elevatie 75°).
- **X**: FIFO uit achtercompartiment in de dichtstbijzijnde bloem als je binnen
  `FLOWER_PLACE_RANGE` (0.55 m) bent — nectar én pollen stacken op het bloemcentrum
  (geen harde 2-cap; soft cap 8). Te ver weg → bal valt op het veld achter de robot.
- **C / LB**: FIFO eject uit achtercompartiment.
- **G / Bloemen vullen**: vult elke bloem weer tot 4 vrije pollen (boven planted stack); planted blijft.

Blocks-helpers in auto:

```python
self.intake.set_power(1.0)   # of 0.0
self.sleep(500)
self.intake.set_power(0.0)
self.shooter.fire()          # of self.shooter.set_power(1.0) → één pulse
```

## CAD-bron & meshes

| Bron | Pad / link |
|------|------------|
| Officiële Field CAD STEP (v26-27.2) | `cad/field-cad-step.zip` → `cad/step/field-cad-step.step` |
| Onshape (referentie) | https://cad.onshape.com/documents/a355e772e3d24813de7852ee/w/f106353168f1f92100b81259/e/95d1e1e442b4138cccaf2d73 |
| AprilTag production PDF | `cad/BIOBUZZAprilTagProduction.pdf` |
| Printable A4 | `cad/PrintableAprilTag_A4.pdf` |

**Geïmporteerd uit CAD (STL, meters, Z-up, veldcentrum = origin):**

- `hive_frame.stl` — A-frame / voeten / ACM panel
- `hive_red.stl` / `hive_blue.stl` — cell skins, churros, pivot (zonder dense Goal Ribs)
- `flower_{pos_y,neg_y,neg_x,pos_x}.stl` — vier FLOWER-assemblages op officiële CAD-posities

**Primitives (niet uit CAD):** vloer/tegels, perimeter-muren, garden/loading tape, collision-boxes
voor CELL-openingen, robot chassis. Perimeter-panels/tegels uit STEP zijn bewust weggelaten
(te zwaar; vloer blijft simpele checker).

Conversie: `cascadio` (STEP→GLB) + `trimesh` + `pyfqmr` (decimate). Eenheden in STEP = **meter**
(SI). Onshape Y-up → MuJoCo Z-up via de rotatie `(x,y,z)→(x,−z,y)` (+90° om X, det +1, geen spiegeling; `scripts/convert_field_cad.py`).

Rapport: `cad/meshes/import_report.txt`.

## AprilTags (§9.9 + production PDF)

- Familie **36h11**, **3.25 in (0.08255 m)** vierkant
- Op de **onderkant** van elke CELL, kijkend naar de tegels, onderrand richting veldcentrum (§9.9)
- Site-frame = de gedrukte tag: `+X` = rechts, `+Y` = boven (richting de CELL-opening), `+Z` = uit het
  tagvlak (naar de tegels)
- Cluster van **4 tags per CELL** (horizontale strip), op x = −6,5 / −2,75 / 2,75 / 6,5 in langs
  gedrukt-rechts, zoals FTC SDK 12 `AprilTagGameDatabase.getBioBuzzTagLibrary()`

| CELL | IDs (L→R) |
|------|-----------|
| Red Scoring | 30, 31, 32, 33 |
| Red Audience | 34, 35, 36, 37 |
| Blue Audience | 38, 39, 40, 41 |
| Blue Scoring | 42, 43, 44, 45 |

De browser Blocks-simulator volgt voor deze IDs de SDK 12 cluster-semantiek: één zichtbare member is genoeg voor één `AprilTagClusterDetection`; members verschijnen niet als losse detections. De cluster-pose is de SDK-multitag-oplossing met de ledenposities uit de SDK-library (oorsprong ≈ midden van de bewegende CELL-opening, ±2,7 cm) en `percentClusterFound` is 25/50/75/100. Vanaf de tegels gezien lopen de IDs links→rechts; een omhoog-CELL geeft |roll| < 90°, een omlaag-CELL |roll| > 90°.

Sites: `apriltag_<id>` · textures: `ftc_sim/assets/textures/apriltag_XX.png`
(de officiële AprilRobotics tag36h11-afbeeldingen, rechtop zoals de productie-PDF: hoek 0 linksonder; tot 2026-10 stonden ze 180° gedraaid). Het zichtbare tagvlak is 10/8 × 3,25 in, zodat het zwarte vierkant precies 3,25 in is.

## Veld & staging (handboek §9 / §10.3.1)

| Element | Specificatie (SI) |
|---------|-------------------|
| Veld | 3.6576 × 3.6576 m (144×144 in) |
| FLOWERS | CAD-centra (−0.594, 1.728) achter B/C, (0.594, −1.728) publiek D/E, (−1.728, −0.594) rode muur 2/3, (1.728, 0.594) blauwe muur 4/5 |
| POLLEN | 40× Ø 0.07112 m |
| LOADING ZONE | rood TILE **A5**, blauw **F2**; 0,584 × 0,2795 m tegen de alliantiemuur (Guide §8.3, §9.3) |
| GARDEN | rood **A1** (publieksmuur), blauw **F6** (achtermuur); 0,584 × 0,051 m (Guide §8.4) |
| Robot-start | rood, tegen de −X-muur zonder penetratie, op A6 (−1,569; +1,476), buiten de LOADING ZONE (G304) |

**POLLEN-telling:** 16 in FLOWERS + 4 rode GARDEN + 4 blauwe GARDEN + 4 preload (hopper) + 12 overige starts = **40**.

**TILE-raster (niet gespiegeld):** het sim-veld ligt zoals het echte veld (manual Fig. 9-2, Guide Fig. 6-2). Gezien vanaf het publiek (−Y) zit de rode alliantiemuur links (−X). Kolommen A→F = −X→+X, rijen 1→6 = **−Y (publiek) → +Y (achter)**. Rode GARDEN A1 (publieksmuur), rode LOADING ZONE A5, blauwe LOADING ZONE F2, blauwe GARDEN F6 (`C.tile_center()`, `C.loading_zone_rect()`, `C.garden_rect()`). FTC-veldcoördinaten (rode muur links, zoals bij DECODE): `C.sim_to_ftc_field(x, y) = (−y, x)`.

Tot 2026-10 werd de CAD ingelezen met `(x,y,z)→(x,z,y)`. Dat is een spiegeling (det −1): het hele sim-veld was Fig. 9-2 in Y gespiegeld, en de tegels waren daarop aangepast. De import is nu een echte rotatie. De meshes zijn gemigreerd (`scripts/convert_field_cad.py migrate --legacy`, faces opnieuw gewonden) en `convert_field_cad.py check` meet ze tegen de CAD-GLB: ≈ 1–2 mm met de nieuwe transform, ≈ 100–165 mm met de oude.

## Projectstructuur

```
ftc_sim/
  constants.py      # SI-afmetingen, AprilTag-IDs, intake/shoot
  scene.py          # MJCF-generator (CAD meshes + primitives)
  mechanisms.py     # intake / hopper / arc shooter
  hive_tip.py       # bi-stable HIVE tip + extra nectar
  sim.py / controls.py / blocks.py / auto_modes.py
  teleop.py / auto.py / viewer.py
  assets/meshes/    # CAD STLs
  assets/textures/  # AprilTag PNGs
web/                # Browser MuJoCo WASM + Three.js (Vite)
cad/step/           # uitgepakte STEP
```

## Beperkingen

- HIVE Goal Ribs in CAD-meshes; skins semi-transparant; onzichtbare CELL-cups voor fysica.
- Intake/shooter zijn **benaderingen** (capture-zone + impuls), geen volledige roller-physics.
- HIVE tip is bi-stabiel (hinge); kantelt bij 8 POLLEN of 3 NECTAR + 3 POLLEN (telling, geen gewichtsmodel); NECTAR is free + valt bij tip.
- Turns in auto op track-geometrie (geen IMU).

Officiële CAD: https://ftc-resources.firstinspires.org/ftc/field

## Licentie / disclaimer

Niet-officiële team-simulator. FIRST®, FTC® en BIOBUZZ zijn merken van FIRST.
