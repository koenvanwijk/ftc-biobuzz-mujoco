#!/usr/bin/env python3
"""Official BIOBUZZ Field CAD → MuJoCo frame (meshes + key CAD points).

Frames
------
The Onshape/cascadio export (``cad/meshes/field_coarse.glb``) is glTF: right-handed, Y up.
The sim is right-handed, Z up, field centre at the origin. The correct transform is a *rotation*
of +90° about X::

    CAD_TO_SIM: (x, y, z) -> (x, -z, y)      det = +1

Result: red ALLIANCE wall at −X, audience wall at −Y, TILE rows 1→6 = −Y→+Y, columns A→F = −X→+X
(Event Field Setup Guide Fig. 6-2 / manual Fig. 9-2 seen from the audience, red on the left).

Until 2026-10 the import used ``(x, y, z) -> (x, z, y)`` (det = −1, a *mirror*), so the whole sim
field was Fig. 9-2 mirrored in Y. ``migrate`` converts meshes that were exported with that legacy
transform: world-frame meshes get ``diag(1, −1, 1)`` (= CAD_TO_SIM · LEGACY⁻¹), CELL-local meshes
get ``diag(−1, 1, 1)`` (see ``ftc_sim/scene.py``: the CELL bodies' tip angle and open_sign flip with
it), and every face is re-wound so normals stay outward (a reflection turns meshes inside out).

Commands (run in a venv with numpy + trimesh; scipy for ``check``)::

    python scripts/convert_field_cad.py points            # key CAD points in sim frame (JSON)
    python scripts/convert_field_cad.py check             # committed STLs vs CAD (mean NN distance)
    python scripts/convert_field_cad.py migrate --legacy  # one-off: legacy-mirrored STLs → CAD_TO_SIM

``points``/``check`` need the (git-ignored) ``cad/meshes/field_coarse.glb``.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MESH_DIR = ROOT / "ftc_sim" / "assets" / "meshes"
GLB = ROOT / "cad" / "meshes" / "field_coarse.glb"
MESH_COPIES = [ROOT / "web" / "public" / "assets" / "meshes", ROOT / "web-blocks" / "public" / "assets" / "meshes"]

# glTF (Y up) → sim (Z up): +90° about X. Proper rotation, no mirror.
CAD_TO_SIM = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])
# Pre-2026-10 import (a reflection; kept only to migrate old exports).
LEGACY_CAD_TO_SIM = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0]])

WORLD_MESHES = [
    "hive_frame", "hive_red", "hive_blue",
    "flower_pos_y", "flower_neg_y", "flower_neg_x", "flower_pos_x",
]
CELL_LOCAL_MESHES = ["cell_rim_front", "cell_rim_back", "cell_shell", "cell_back_cap"]
# A Y-reflection moves the ±Y-wall FLOWERS to the other wall, so their files swap names.
LEGACY_RENAME = {"flower_pos_y": "flower_neg_y", "flower_neg_y": "flower_pos_y"}


def _load_glb():
    import trimesh

    if not GLB.exists():
        sys.exit(f"missing {GLB} (unzip field-cad-step.zip / re-export with cascadio)")
    return trimesh.load(GLB, force="scene")


def _parts(scene, pattern: str):
    """Yield (name, mesh in sim frame) for GLB parts whose name matches ``pattern``."""
    rx = re.compile(pattern)
    T = np.eye(4)
    T[:3, :3] = CAD_TO_SIM
    for name in scene.graph.nodes_geometry:
        if not rx.search(name):
            continue
        tf, geom = scene.graph[name]
        m = scene.geometry[geom].copy()
        m.apply_transform(tf)
        m.apply_transform(T)
        yield name, m


def cad_points() -> dict:
    """Key CAD points in the sim frame (metres)."""
    s = _load_glb()
    out: dict = {"transform": "(x,y,z)->(x,-z,y)"}
    out["flowers"] = sorted(
        [[round(float(v), 5) for v in m.centroid[:2]] for _n, m in _parts(s, r"Flower Layer C")]
    )
    out["apriltag_plates"] = {
        n.split(": ")[1]: [round(float(v), 5) for v in m.centroid] for n, m in _parts(s, r"Goal April Tag")
    }
    for color in ("Red", "Blue"):
        cells = [m.centroid for _n, m in _parts(s, rf"{color} Nectar") if m.centroid[2] > 0.5]
        out[f"nectar_{color.lower()}_in_cell"] = sorted([[round(float(v), 4) for v in c] for c in cells])
    tape = {}
    for n, m in _parts(s, r"Gaffer Tape"):
        lo, hi = m.bounds
        if abs(lo[0]) > 1.84:  # ALLIANCE AREA tape outside the perimeter
            continue
        tape.setdefault(re.sub(r"_\d+$", "", n), []).append(
            [round(float(lo[0]), 4), round(float(hi[0]), 4), round(float(lo[1]), 4), round(float(hi[1]), 4)]
        )
    out["tape_xy_bounds"] = tape
    return out


def _write_stl(mesh, path: Path) -> None:
    path.write_bytes(mesh.export(file_type="stl"))


def migrate_legacy() -> None:
    """Convert STLs exported with LEGACY_CAD_TO_SIM to CAD_TO_SIM (in place, + web copies)."""
    import trimesh

    F_world = CAD_TO_SIM @ np.linalg.inv(LEGACY_CAD_TO_SIM)  # diag(1, −1, 1)
    F_cell = np.diag([-1.0, 1.0, 1.0])
    converted: dict[str, trimesh.Trimesh] = {}
    for base in WORLD_MESHES:
        for suffix in ("", "_hull"):
            name = base + suffix
            path = MESH_DIR / f"{name}.stl"
            if not path.exists():
                continue
            m = trimesh.load(path, process=False)
            T = np.eye(4)
            T[:3, :3] = F_world
            m.apply_transform(T)  # trimesh re-winds faces when det(T) < 0
            new_base = LEGACY_RENAME.get(base, base)
            converted[new_base + suffix] = m
    for name in CELL_LOCAL_MESHES:
        path = MESH_DIR / f"{name}.stl"
        if not path.exists():
            continue
        m = trimesh.load(path, process=False)
        T = np.eye(4)
        T[:3, :3] = F_cell
        m.apply_transform(T)
        converted[name] = m
    for name, m in converted.items():
        for d in [MESH_DIR, *MESH_COPIES]:
            if d.exists():
                _write_stl(m, d / f"{name}.stl")
        print(f"migrated {name}.stl ({len(m.faces)} faces)")


def check() -> int:
    """Mean nearest-neighbour distance (mm) of committed world-frame STL vertices to the CAD surface,
    with CAD_TO_SIM and with the legacy mirror. A correct import is ≪ the mirrored one."""
    import trimesh
    from scipy.spatial import cKDTree

    s = _load_glb()
    pts_new, pts_old = [], []
    T_old = np.eye(4)
    T_old[:3, :3] = LEGACY_CAD_TO_SIM @ np.linalg.inv(CAD_TO_SIM)
    for _n, m in _parts(s, r"."):
        lo, hi = m.bounds
        if hi[2] < 0.0 or np.max(np.abs(lo[:2])) > 1.9:  # skip tiles/perimeter/alliance area
            continue
        p, _ = trimesh.sample.sample_surface(m, max(20, min(4000, len(m.faces) * 2)), seed=1)
        pts_new.append(p)
        pts_old.append(trimesh.transform_points(p, T_old))
    tree_new = cKDTree(np.vstack(pts_new))
    tree_old = cKDTree(np.vstack(pts_old))
    bad = 0
    for name in WORLD_MESHES:
        path = MESH_DIR / f"{name}.stl"
        if not path.exists():
            continue
        v = trimesh.load(path, process=False).vertices
        d_new = float(np.mean(tree_new.query(v)[0]) * 1000)
        d_old = float(np.mean(tree_old.query(v)[0]) * 1000)
        ok = d_new < 5.0 and d_new < d_old
        bad += 0 if ok else 1
        print(f"{name:14s} CAD_TO_SIM {d_new:7.2f} mm   legacy-mirror {d_old:7.2f} mm   {'OK' if ok else 'MISMATCH'}")
    return bad


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("points")
    sub.add_parser("check")
    mg = sub.add_parser("migrate")
    mg.add_argument("--legacy", action="store_true", required=True, help="input STLs use LEGACY_CAD_TO_SIM")
    args = ap.parse_args()
    if args.cmd == "points":
        print(json.dumps(cad_points(), indent=1))
    elif args.cmd == "check":
        sys.exit(1 if check() else 0)
    else:
        migrate_legacy()


if __name__ == "__main__":
    main()
