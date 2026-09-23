#!/usr/bin/env python3
"""Convert official Field CAD STEP → MuJoCo STLs (run inside project venv)."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# See cad/meshes/import_report.txt for last import notes.
print("Re-run the extraction pipeline documented in README (cascadio + trimesh + pyfqmr).")
print("Key outputs: ftc_sim/assets/meshes/{hive_frame,hive_red,hive_blue,flower_*}.stl")
print("STEP source: cad/step/field-cad-step.step (from field-cad-step.zip)")
