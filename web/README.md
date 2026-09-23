# BIOBUZZ MuJoCo — browser (WASM)

Interactieve web-viewer van dezelfde FTC BIOBUZZ-scene als de Python-sim:
officiële `@mujoco/mujoco` WASM (single-threaded), Three.js-rendering, tank-drive
teleop, intake/arc-shoot, HIVE tip, en een korte autonome LeaveAndGarden-sequentie.

## Vereisten

- Node.js 18+ (getest met 20)
- Chrome / Edge / Firefox recent

## Installeren & starten

```bash
cd /workspace/ftc-biobuzz-mujoco/web
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open in Chrome: **http://localhost:5173/** (of het LAN-IP van deze box).

Productie-build:

```bash
npm run build
npm run preview
```

Headless smoke (laadt XML+meshes in Node WASM, stept physics):

```bash
npm run smoke
```

## Besturing

| Input | Actie |
|-------|--------|
| `W`/`S` · `I`/`K` | Tank links / rechts |
| `WASD` / pijltjes | Arcade (throttle + bocht) |
| Gamepad sticks | Tank (of arcade als rechts X dominant) |
| `E` / RB (hold) | Intake AAN |
| `Space` / `F` / RT | Shoot één pollen |
| `T` | Wissel tank ↔ arcade |
| `R` / knop Reset | Keyframe + 4 preload in hopper |
| Knop **Autonoom** | LeaveAndGarden-sequentie |
| Muis drag / scroll | Orbit camera / zoom |

## Assets

`public/assets/` bevat een kopie van `../ftc_sim/assets/`:

- `biobuzz_scene.xml` — `meshdir="meshes"` · `texturedir="textures"`
- `meshes/*.stl` — CAD visuals + hulls (~7 MB)
- `textures/apriltag_*.png`

Bij scene-wijzigingen in Python:

```bash
source ../.venv/bin/activate
python -c 'from ftc_sim.scene import write_scene; write_scene()'
cp ../ftc_sim/assets/biobuzz_scene.xml public/assets/
cp ../ftc_sim/assets/meshes/*.stl public/assets/meshes/
cp ../ftc_sim/assets/textures/*.png public/assets/textures/
```

## Architectuur

1. `loadMujoco()` → Emscripten FS `/working/` met XML + binaire STL/PNG
2. `MjModel.mj_loadXML` + `MjData` + keyframe 0
3. Three.js bouwt meshes uit MuJoCo-geoms (`mesh_vert`/`mesh_face` voor CAD)
4. Elke frame: controls → `mech.update()` → `mj_step` (substeps) → sync `geom_xpos`/`geom_xmat`

Intake/shooter is dezelfde benadering als `ftc_sim/mechanisms.py` (capture-zone + 7 m/s @ 75° boog). HIVE tip: `hive_tip.js` (3 nectar+4 pollen of 8 pollen).

## Beperkingen

- Single-threaded WASM (geen COOP/COEP nodig); zware scene (~120 geoms, ~200k mesh-verts)
- Builtin MuJoCo checker op tegels → Three.js canvas-checker i.p.v. `tex_data`
- HIVE tip / NECTAR blijven statisch; intake is geen roller-physics
- Geen native MuJoCo visualizer — eigen Three.js-sync

De Python-sim (`python -m ftc_sim.viewer` / `teleop`) blijft ongewijzigd.

## Combined Blocks app

For **FTC Blocks editor + this BIOBUZZ field** in one UI, use [`../web-blocks/`](../web-blocks/) (same repo):

```bash
cd web-blocks && npm install && npm run dev
```

Open http://localhost:5174/ (default world=biobuzz). This teleop-only viewer on :5173 stays unchanged.

GitHub Pages (after merge): https://koenvanwijk.github.io/ftc-biobuzz-mujoco/
