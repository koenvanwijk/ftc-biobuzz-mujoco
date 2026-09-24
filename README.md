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

- **Front intake** (+X): POLLEN → voorhopper (shooter), max 8; **4 preload** starten daar.
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
(SI). Onshape Y-up → MuJoCo Z-up via assen-swap `(x,y,z)→(x,z,y)`.

Rapport: `cad/meshes/import_report.txt`.

## AprilTags (§9.9 + production PDF)

- Familie **36h11**, **3.25 in (0.08255 m)** vierkant
- Op de **onderkant** van elke CELL, kijkend naar de tegels; site `zaxis` = naar beneden,
  `xaxis` = richting veldcentrum (onderkant tag)
- Cluster van **4 tags per CELL** (horizontale strip)

| CELL | IDs (L→R) |
|------|-----------|
| Red Scoring | 30, 31, 32, 33 |
| Red Audience | 34, 35, 36, 37 |
| Blue Audience | 38, 39, 40, 41 |
| Blue Scoring | 42, 43, 44, 45 |

De browser Blocks-simulator volgt voor deze IDs de SDK 12 cluster-semantiek: één zichtbare member is genoeg voor één `AprilTagClusterDetection`; members verschijnen niet als losse detections. De gerapporteerde pose wijst naar het midden van de bewegende CELL-opening en `percentClusterFound` is 25/50/75/100.

Sites: `apriltag_<id>` · textures: `ftc_sim/assets/textures/apriltag_XX.png`
(gegenereerd met OpenCV `DICT_APRILTAG_36h11`).

## Veld & staging (handboek §9 / §10.3.1)

| Element | Specificatie (SI) |
|---------|-------------------|
| Veld | 3.6576 × 3.6576 m (144×144 in) |
| FLOWERS | CAD-centra o.a. (±0.594, ±1.728) / (±1.728, ±0.594) |
| POLLEN | 40× Ø 0.07112 m |

**POLLEN-telling:** 16 in FLOWERS + 4 rode GARDEN + 4 blauwe GARDEN + 4 preload (hopper) + 12 overige starts = **40**.

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
- HIVE tip is bi-stabiel (hinge); NECTAR is free + valt bij tip.
- Turns in auto op track-geometrie (geen IMU).

Officiële CAD: https://ftc-resources.firstinspires.org/ftc/field

## Licentie / disclaimer

Niet-officiële team-simulator. FIRST®, FTC® en BIOBUZZ zijn merken van FIRST.
