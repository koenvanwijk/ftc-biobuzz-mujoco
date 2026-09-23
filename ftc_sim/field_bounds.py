"""Reintroduce POLLEN/NECTAR that leave the FIELD (BIOBUZZ §10.8.2)."""

from __future__ import annotations

import mujoco
import numpy as np

from . import constants as C

# Interior half-extent with a small padding so balls aren't stuck in the wall.
_MARGIN = 0.02
# Below tiles / over walls / fallen through world
_Z_MIN = -0.05
_Z_MAX = 2.8
# Parked extra nectar (pre-tip) lives at EXTRA_NECTAR_PARK_Z — leave alone.
_PARK_Z_THRESH = 2.5


class FieldBoundsReturn:
    """
    Each step: if a free pollen/nectar center is outside the field interior
    (±HALF in X/Y) or z is below the floor / absurdly high, teleport it back
    onto the tile surface near the exit point with zero velocity.

    Skips hopper-held pollen and parked extra nectar (z > 2.5 m).
    """

    def __init__(self, model: mujoco.MjModel, data: mujoco.MjData) -> None:
        self.model = model
        self.data = data
        self._bodies: list[tuple[int, float]] = []  # (body_id, radius)
        self._qpos_adr: dict[int, int] = {}
        self._qvel_adr: dict[int, int] = {}
        for i in range(model.nbody):
            name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, i)
            if not name:
                continue
            if name.startswith("pollen_"):
                r = C.POLLEN_R
            elif name.startswith("nectar_") and "intake" not in name:
                r = C.NECTAR_R
            else:
                continue
            jnt = model.body_jntadr[i]
            if jnt < 0:
                continue
            self._bodies.append((i, r))
            self._qpos_adr[i] = int(model.jnt_qposadr[jnt])
            self._qvel_adr[i] = int(model.jnt_dofadr[jnt])
        self.protected: set[int] = set()  # hopper-held body ids
        self.last_returns = 0

    def set_protected(self, body_ids: set[int] | list[int]) -> None:
        self.protected = set(body_ids)

    def update(self) -> int:
        """Return number of balls reintroduced this step."""
        half = C.HALF - _MARGIN
        z_tile = C.TILE_THICKNESS
        n = 0
        for bid, radius in self._bodies:
            if bid in self.protected:
                continue
            pos = np.array(self.data.xpos[bid], dtype=float)
            # Parked extras (waiting above field) — do not touch
            if pos[2] >= _PARK_Z_THRESH:
                continue
            out = (
                abs(pos[0]) > half
                or abs(pos[1]) > half
                or pos[2] < _Z_MIN
                or pos[2] > _Z_MAX
            )
            if not out:
                continue
            # Clamp to nearest interior point on the tile
            x = float(np.clip(pos[0], -half, half))
            y = float(np.clip(pos[1], -half, half))
            # If it left through a wall, nudge further inward from the wall face
            if abs(pos[0]) > half:
                x = float(np.sign(pos[0]) * (half - radius - 0.01))
            if abs(pos[1]) > half:
                y = float(np.sign(pos[1]) * (half - radius - 0.01))
            z = z_tile + radius + 0.002
            adr = self._qpos_adr[bid]
            self.data.qpos[adr : adr + 3] = (x, y, z)
            self.data.qpos[adr + 3 : adr + 7] = (1.0, 0.0, 0.0, 0.0)
            vadr = self._qvel_adr[bid]
            self.data.qvel[vadr : vadr + 6] = 0.0
            n += 1
        self.last_returns = n
        return n


def make_field_bounds(model: mujoco.MjModel, data: mujoco.MjData) -> FieldBoundsReturn:
    return FieldBoundsReturn(model, data)
