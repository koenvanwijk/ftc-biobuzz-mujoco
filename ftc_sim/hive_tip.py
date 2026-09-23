"""BIOBUZZ HIVE bi-stable tipping: detect fill threshold, flip pose, spawn extra nectar."""

from __future__ import annotations

from dataclasses import dataclass, field

import mujoco
import numpy as np

from . import constants as C


def _quat_mul(q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
    """MuJoCo (w, x, y, z) product q1 ⊗ q2."""
    w1, x1, y1, z1 = q1
    w2, x2, y2, z2 = q2
    return np.array(
        [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        ],
        dtype=float,
    )


def _quat_rx(rad: float) -> np.ndarray:
    half = 0.5 * rad
    return np.array([np.cos(half), np.sin(half), 0.0, 0.0], dtype=float)


def _rot_x_mat(rad: float) -> np.ndarray:
    c, s = np.cos(rad), np.sin(rad)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]], dtype=float)


@dataclass
class _TipAnim:
    start_time: float
    duration: float
    q_from: float
    q_to: float
    # bid -> (rel_pos_about_pivot at tip start, quat at tip start)
    carry: dict[int, tuple[np.ndarray, np.ndarray]]
    hold_until: float = 0.0  # keep absolute place until this sim time


@dataclass
class HiveTipState:
    # tip_state 0 = CAD start pose; 1 = other bi-stable pose
    tip_state: dict[str, int] = field(default_factory=lambda: {"red": 0, "blue": 0})
    # How many tip-bonus nectar already spawned per alliance (cap = NECTAR_EXTRA_POOL)
    extras_released: dict[str, int] = field(default_factory=lambda: {"red": 0, "blue": 0})
    tip_count: dict[str, int] = field(default_factory=lambda: {"red": 0, "blue": 0})
    score: dict[str, int] = field(default_factory=lambda: {"red": 0, "blue": 0})
    cooldown_until: dict[str, float] = field(default_factory=lambda: {"red": 0.0, "blue": 0.0})
    last_event: str = ""


class HiveTipController:
    """
    Bi-stable tip when the *currently upward* CELL holds:
      - ≥3 alliance NECTAR + ≥4 POLLEN, or
      - ≥8 POLLEN alone.
    Tips either direction: filling the other cell tips the hive back.
    Each tip: release one parked extra nectar (up to NECTAR_MAX_PER_ALLIANCE total).

    Tip animates about ±X through the HIVE pivot. Free nectar/pollen inside either
    CELL of that hive are carried with the same Rx so they stay captured (an
    instantaneous qpos teleport would leave them behind and spill out the back).
    """

    COOLDOWN_S = 1.25  # settle after a flip before counting again
    ANIM_S = 0.40  # gradual tip duration (seconds)
    SETTLE_S = 0.20  # keep carrying at final pose so contacts form

    def __init__(self, model: mujoco.MjModel, data: mujoco.MjData) -> None:
        self.model = model
        self.data = data
        self.state = HiveTipState()
        self._joint_qadr: dict[str, int] = {}
        self._joint_dadr: dict[str, int] = {}
        self._shell_body: dict[str, int] = {}
        self._pollen_ids: list[int] = []
        self._nectar_ids: dict[str, list[int]] = {"red": [], "blue": []}
        # extras[color] = list of body ids in release order
        self._extra_ids: dict[str, list[int]] = {"red": [], "blue": []}
        self._extra_qadr: dict[str, list[int]] = {"red": [], "blue": []}
        self._extra_vadr: dict[str, list[int]] = {"red": [], "blue": []}
        self._body_qadr: dict[int, int] = {}
        self._body_vadr: dict[int, int] = {}
        self._tip_anim: dict[str, _TipAnim | None] = {"red": None, "blue": None}
        self._pivot = np.array([0.0, 0.0, C.TILE_THICKNESS + C.HIVE_PIVOT_Z], dtype=float)
        self._resolve_ids()

    def _resolve_ids(self) -> None:
        m = self.model
        for color, jname in (("red", "hive_red_tip"), ("blue", "hive_blue_tip")):
            jid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, jname)
            if jid >= 0:
                self._joint_qadr[color] = int(m.jnt_qposadr[jid])
                self._joint_dadr[color] = int(m.jnt_dofadr[jid])
        for key in C.CELL_SHELLS:
            bid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, f"{key}_shell")
            if bid >= 0:
                self._shell_body[key] = bid
        for i in range(m.nbody):
            name = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_BODY, i)
            if not name:
                continue
            if name.startswith("pollen_"):
                self._pollen_ids.append(i)
            elif name.startswith("nectar_red_") and "extra" not in name:
                self._nectar_ids["red"].append(i)
            elif name.startswith("nectar_blue_") and "extra" not in name:
                self._nectar_ids["blue"].append(i)
            elif name.startswith("nectar_extra_red_"):
                self._extra_ids["red"].append(i)
            elif name.startswith("nectar_extra_blue_"):
                self._extra_ids["blue"].append(i)
        for color in ("red", "blue"):
            bodies = self._extra_ids[color]
            bodies.sort(
                key=lambda bid: mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_BODY, bid) or ""
            )
            self._extra_ids[color] = bodies
            self._extra_qadr[color] = []
            self._extra_vadr[color] = []
            for bid in bodies:
                jnt = m.body_jntadr[bid]
                self._extra_qadr[color].append(int(m.jnt_qposadr[jnt]))
                self._extra_vadr[color].append(int(m.jnt_dofadr[jnt]))
        for bid in (
            self._pollen_ids
            + self._nectar_ids["red"]
            + self._nectar_ids["blue"]
            + self._extra_ids["red"]
            + self._extra_ids["blue"]
        ):
            jnt = m.body_jntadr[bid]
            if jnt < 0:
                continue
            self._body_qadr[bid] = int(m.jnt_qposadr[jnt])
            self._body_vadr[bid] = int(m.jnt_dofadr[jnt])

    def reset(self) -> None:
        self.state = HiveTipState()
        self._tip_anim = {"red": None, "blue": None}
        for color in ("red", "blue"):
            if color in self._joint_qadr:
                self.data.qpos[self._joint_qadr[color]] = 0.0
                self.data.qvel[self._joint_dadr[color]] = 0.0
            for i in range(len(self._extra_qadr.get(color, []))):
                self._park_extra(color, i)

    def update(self) -> None:
        self._hold_tip_joints()
        self._hold_parked_extras()
        t = float(self.data.time)
        for color in ("red", "blue"):
            if color not in self._joint_qadr:
                continue
            if self._tip_anim[color] is not None:
                continue
            if t < self.state.cooldown_until[color]:
                continue
            n_nectar, n_pollen = self.count_in_upward_cell(color)
            if (n_nectar >= C.TIP_NECTAR_REQUIRED and n_pollen >= C.TIP_POLLEN_WITH_NECTAR) or (
                n_pollen >= C.TIP_POLLEN_ALONE
            ):
                self._do_tip(color, n_nectar, n_pollen)

    def _tip_target_rad(self, color: str) -> float:
        sign = C.HIVE_TIP_JOINT_SIGN[f"hive_{color}"]
        if self.state.tip_state[color] == 0:
            return 0.0
        return float(np.radians(sign * C.HIVE_TIP_TRAVEL_DEG))

    def _hold_tip_joints(self) -> None:
        t = float(self.data.time)
        for color in ("red", "blue"):
            if color not in self._joint_qadr:
                continue
            anim = self._tip_anim[color]
            if anim is None:
                self.data.qpos[self._joint_qadr[color]] = self._tip_target_rad(color)
                self.data.qvel[self._joint_dadr[color]] = 0.0
                continue
            alpha = (t - anim.start_time) / anim.duration if anim.duration > 0 else 1.0
            if alpha >= 1.0:
                self._set_joint_and_place_carry(color, anim, anim.q_to)
                if t >= anim.hold_until:
                    self._tip_anim[color] = None
            else:
                s = alpha * alpha * (3.0 - 2.0 * alpha)
                q = anim.q_from + s * (anim.q_to - anim.q_from)
                self._set_joint_and_place_carry(color, anim, q)

    def _set_joint_and_place_carry(self, color: str, anim: _TipAnim, q: float) -> None:
        """Hold tip joint at q and rigidly place carried balls from tip-start snapshot."""
        self.data.qpos[self._joint_qadr[color]] = q
        self.data.qvel[self._joint_dadr[color]] = 0.0
        # Delta from CAD tip-start (joint=0) — snapshot rel was taken at q_from
        dq_from_start = float(q - anim.q_from)
        R = _rot_x_mat(dq_from_start)
        q_rx = _quat_rx(dq_from_start)
        for bid, (rel0, quat0) in anim.carry.items():
            adr = self._body_qadr.get(bid)
            vadr = self._body_vadr.get(bid)
            if adr is None or vadr is None:
                continue
            pos = self._pivot + (R @ rel0)
            quat = _quat_mul(q_rx, quat0)
            n = np.linalg.norm(quat)
            if n > 1e-12:
                quat = quat / n
            self.data.qpos[adr : adr + 3] = pos
            self.data.qpos[adr + 3 : adr + 7] = quat
            self.data.qvel[vadr : vadr + 6] = 0.0

    def _hold_parked_extras(self) -> None:
        for color in ("red", "blue"):
            n_done = self.state.extras_released[color]
            for i in range(n_done, len(self._extra_qadr.get(color, []))):
                self._park_extra(color, i)

    def _hive_cell_keys(self, color: str) -> list[str]:
        return [k for k, spec in C.CELL_SHELLS.items() if spec.get("color") == color]

    def _balls_in_hive_cells(self, color: str) -> list[int]:
        keys = self._hive_cell_keys(color)
        candidates = list(self._nectar_ids[color]) + list(self._pollen_ids)
        n_done = self.state.extras_released[color]
        candidates.extend(self._extra_ids[color][:n_done])
        out: list[int] = []
        seen: set[int] = set()
        for bid in candidates:
            if bid in seen:
                continue
            if any(self._in_cell(bid, key, margin=-0.01) for key in keys):
                out.append(bid)
                seen.add(bid)
        return out

    def count_in_upward_cell(self, color: str) -> tuple[int, int]:
        cell_key = C.HIVE_UPWARD_CELL[color][self.state.tip_state[color]]
        n_nectar = sum(1 for bid in self._nectar_ids[color] if self._in_cell(bid, cell_key))
        n_pollen = sum(1 for bid in self._pollen_ids if self._in_cell(bid, cell_key))
        return n_nectar, n_pollen

    def _in_cell(self, bid: int, cell_key: str, margin: float = 0.02) -> bool:
        shell_id = self._shell_body.get(cell_key)
        if shell_id is None:
            return False
        spec = C.CELL_SHELLS[cell_key]
        s_open = float(spec.get("open_sign", 1.0))
        origin = np.array(self.data.xpos[shell_id], dtype=float)
        R = self.data.xmat[shell_id].reshape(3, 3)
        pos = np.array(self.data.xpos[bid], dtype=float)
        local = R.T @ (pos - origin)
        w = C.CELL_OPEN_W / 2 - margin
        h = C.CELL_OPEN_H / 2 - margin
        d = C.CELL_OPEN_D / 2
        if abs(local[0]) > w or abs(local[2]) > h:
            return False
        y_open = s_open * d
        y_back = -s_open * d
        y_lo, y_hi = (min(y_back, y_open) + margin, max(y_back, y_open) - margin)
        return y_lo <= local[1] <= y_hi

    def _do_tip(self, color: str, n_nectar: int, n_pollen: int) -> None:
        prev = self.state.tip_state[color]
        q_from = float(self.data.qpos[self._joint_qadr[color]])
        self.state.tip_state[color] = 1 - prev
        q_to = self._tip_target_rad(color)
        carry: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        for bid in self._balls_in_hive_cells(color):
            adr = self._body_qadr.get(bid)
            if adr is None:
                continue
            pos = np.array(self.data.qpos[adr : adr + 3], dtype=float)
            quat = np.array(self.data.qpos[adr + 3 : adr + 7], dtype=float)
            carry[bid] = (pos - self._pivot, quat.copy())
        t = float(self.data.time)
        self._tip_anim[color] = _TipAnim(
            start_time=t,
            duration=self.ANIM_S,
            q_from=q_from,
            q_to=q_to,
            carry=carry,
            hold_until=t + self.ANIM_S + self.SETTLE_S,
        )
        self.state.cooldown_until[color] = t + self.COOLDOWN_S + self.ANIM_S + self.SETTLE_S
        self.state.tip_count[color] += 1
        self.state.score[color] += C.TIP_POINTS
        spawned = self._release_extra_nectar(color)
        direction = "TIP" if self.state.tip_state[color] == 1 else "TIP BACK"
        total = C.NECTAR_STAGED_PER_ALLIANCE + self.state.extras_released[color]
        extra_msg = (
            f"; +1 {color} nectar (total {total}/{C.NECTAR_MAX_PER_ALLIANCE})"
            if spawned
            else f"; nectar cap {C.NECTAR_MAX_PER_ALLIANCE}"
        )
        self.state.last_event = (
            f"HIVE {color.upper()} {direction} +{C.TIP_POINTS} "
            f"(score {self.state.score[color]}) — nectar={n_nectar} pollen={n_pollen}{extra_msg}"
        )
        self._hold_tip_joints()
        mujoco.mj_forward(self.model, self.data)

    def _park_extra(self, color: str, index: int) -> None:
        adr = self._extra_qadr[color][index]
        x = (0.15 if color == "blue" else -0.15) + index * 0.02
        self.data.qpos[adr : adr + 3] = np.array([x, 0.0, C.EXTRA_NECTAR_PARK_Z])
        self.data.qpos[adr + 3 : adr + 7] = np.array([1.0, 0.0, 0.0, 0.0])
        vadr = self._extra_vadr[color][index]
        self.data.qvel[vadr : vadr + 6] = 0.0

    def _release_extra_nectar(self, color: str) -> bool:
        """Spawn one tip-bonus nectar if under the per-alliance cap. Returns True if spawned."""
        idx = self.state.extras_released[color]
        pool = self._extra_qadr.get(color, [])
        if idx >= len(pool) or idx >= C.NECTAR_EXTRA_POOL:
            return False
        sx, sy, sz = C.EXTRA_NECTAR_SPAWN[color]
        sx = sx + (0.05 if color == "blue" else -0.05) * (idx % 3)
        sy = sy + 0.04 * ((idx // 3) % 3)
        sz = max(sz, C.TILE_THICKNESS + C.NECTAR_R + 0.002)
        adr = pool[idx]
        self.data.qpos[adr : adr + 3] = np.array([sx, sy, sz])
        self.data.qpos[adr + 3 : adr + 7] = np.array([1.0, 0.0, 0.0, 0.0])
        vadr = self._extra_vadr[color][idx]
        self.data.qvel[vadr : vadr + 6] = 0.0
        self.state.extras_released[color] = idx + 1
        return True
