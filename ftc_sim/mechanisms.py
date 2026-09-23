"""Front pollen hopper + rear mixed FIFO compartment + arc shooter + flower place."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import mujoco
import numpy as np

from . import constants as C


@dataclass
class HopperState:
    """Front shooter hopper (pollen) + rear mixed FIFO + planted flower stack."""

    stored: list[int] = field(default_factory=list)  # front / shooter: pollen only
    rear_stored: list[int] = field(default_factory=list)  # rear FIFO: nectar OR pollen
    planted: set[int] = field(default_factory=set)  # nectar+pollen in flower cups
    # bid -> (fx, fy, z) exact hold pose at flower center
    plant_pose: dict[int, tuple[float, float, float]] = field(default_factory=dict)
    intake_power: float = 0.0
    shoot_queued: bool = False


class IntakeShooter:
    """
    - intake_power > 0: front → pollen into shooter hopper;
      rear → nectar + pollen into rear FIFO compartment
    - intake_power < 0: reverse — FIFO eject one item from rear
    - fire(): eject one pollen from front muzzle (arc)
    - try_place_nectar(): X — FIFO from rear into flower stack or drop on field
    """

    PRELOAD_SLICE = slice(24, 28)

    def __init__(self, model: mujoco.MjModel, data: mujoco.MjData) -> None:
        self.model = model
        self.data = data
        self.state = HopperState()
        self._pollen_body_ids = [
            i
            for i in range(model.nbody)
            if (n := mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, i))
            and n.startswith("pollen_")
        ]
        self._nectar_body_ids = [
            i
            for i in range(model.nbody)
            if (n := mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, i))
            and n.startswith("nectar_")
            and "intake" not in n
            and model.body_jntadr[i] >= 0
        ]
        self._nectar_id_set = set(self._nectar_body_ids)
        self._pollen_id_set = set(self._pollen_body_ids)
        self._robot_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "robot")
        self._intake_site = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, "intake_site")
        self._nectar_intake_site = mujoco.mj_name2id(
            model, mujoco.mjtObj.mjOBJ_SITE, "nectar_intake_site"
        )
        self._muzzle_site = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, "shooter_muzzle")
        self._flower_xy = [(float(x), float(y)) for _n, x, y, _yaw in C.FLOWER_CAD_XY]
        self._qpos_adr: dict[int, int] = {}
        self._qvel_adr: dict[int, int] = {}
        for bid in self._pollen_body_ids + self._nectar_body_ids:
            jnt = model.body_jntadr[bid]
            self._qpos_adr[bid] = int(model.jnt_qposadr[jnt])
            self._qvel_adr[bid] = int(model.jnt_dofadr[jnt])

    def reset_and_preload(self) -> None:
        self.state = HopperState()
        by_name = {
            mujoco.mj_id2name(self.model, mujoco.mjtObj.mjOBJ_BODY, b): b
            for b in self._pollen_body_ids
        }
        for i in range(self.PRELOAD_SLICE.start, self.PRELOAD_SLICE.stop):
            name = f"pollen_{i:02d}"
            bid = by_name.get(name)
            if bid is not None:
                self._stow_pollen(bid)

    def set_intake_power(self, power: float) -> None:
        self.state.intake_power = float(np.clip(power, -1.0, 1.0))

    def fire(self) -> bool:
        if not self.state.stored:
            return False
        self.state.shoot_queued = True
        return True

    def protected_body_ids(self) -> set[int]:
        """Hopper-held + flower-planted bodies (for field-bounds skip)."""
        return set(self.state.stored) | set(self.state.rear_stored) | set(self.state.planted)

    def update(self) -> None:
        p = self.state.intake_power
        if p > 0.05:
            self._try_capture_pollen_front()
            self._try_capture_nectar_rear()
            self._try_capture_pollen_rear()
        elif p < -0.05:
            self._reverse_eject_rear()
        self._hold_stored()
        self._hold_planted()
        if self.state.shoot_queued:
            self.state.shoot_queued = False
            self._eject_one_pollen()

    def _site_pos(self, site_id: int) -> np.ndarray:
        return np.array(self.data.site_xpos[site_id], dtype=float)

    def _intake_pos(self) -> np.ndarray:
        return self._site_pos(self._intake_site)

    def _nectar_intake_pos(self) -> np.ndarray:
        if self._nectar_intake_site < 0:
            return self._intake_pos()
        return self._site_pos(self._nectar_intake_site)

    def _muzzle_pos(self) -> np.ndarray:
        return self._site_pos(self._muzzle_site)

    def _robot_x_axis(self) -> np.ndarray:
        R = self.data.xmat[self._robot_id].reshape(3, 3)
        return np.array(R[:, 0], dtype=float)

    def _robot_xy(self) -> np.ndarray:
        return np.array(self.data.xpos[self._robot_id][:2], dtype=float)

    def _ball_kind(self, bid: int) -> str:
        return "nectar" if bid in self._nectar_id_set else "pollen"

    def _ball_radius(self, bid: int) -> float:
        return C.NECTAR_R if bid in self._nectar_id_set else C.POLLEN_R

    def _try_capture_pollen_front(self) -> None:
        if len(self.state.stored) >= C.HOPPER_CAPACITY:
            return
        center = self._intake_pos()
        r2 = C.INTAKE_CAPTURE_R ** 2
        busy = set(self.state.stored) | set(self.state.rear_stored) | self.state.planted
        for bid in self._pollen_body_ids:
            if bid in busy:
                continue
            pos = np.array(self.data.xpos[bid], dtype=float)
            if float(np.sum((pos - center) ** 2)) <= r2:
                self._stow_pollen(bid)
                busy.add(bid)
                if len(self.state.stored) >= C.HOPPER_CAPACITY:
                    break

    def _try_capture_pollen_rear(self) -> None:
        if self._nectar_intake_site < 0:
            return
        if len(self.state.rear_stored) >= C.NECTAR_HOPPER_CAPACITY:
            return
        center = self._nectar_intake_pos()
        r2 = C.NECTAR_INTAKE_CAPTURE_R ** 2
        busy = set(self.state.stored) | set(self.state.rear_stored) | self.state.planted
        for bid in self._pollen_body_ids:
            if bid in busy:
                continue
            pos = np.array(self.data.xpos[bid], dtype=float)
            if float(np.sum((pos - center) ** 2)) <= r2:
                self._stow_rear(bid)
                busy.add(bid)
                if len(self.state.rear_stored) >= C.NECTAR_HOPPER_CAPACITY:
                    break

    def _try_capture_nectar_rear(self) -> None:
        if self._nectar_intake_site < 0:
            return
        if len(self.state.rear_stored) >= C.NECTAR_HOPPER_CAPACITY:
            return
        center = self._nectar_intake_pos()
        r2 = C.NECTAR_INTAKE_CAPTURE_R ** 2
        held = set(self.state.rear_stored)
        planted = self.state.planted
        for bid in self._nectar_body_ids:
            if bid in held or bid in planted:
                continue
            pos = np.array(self.data.xpos[bid], dtype=float)
            if pos[2] > 2.5:
                continue
            if float(np.sum((pos - center) ** 2)) <= r2:
                self._stow_rear(bid)
                held.add(bid)
                if len(self.state.rear_stored) >= C.NECTAR_HOPPER_CAPACITY:
                    break

    def _stow_pollen(self, bid: int) -> None:
        """Front / shooter hopper only."""
        if bid in self.state.stored or len(self.state.stored) >= C.HOPPER_CAPACITY:
            return
        if bid in self.state.rear_stored:
            self.state.rear_stored.remove(bid)
        self.state.planted.discard(bid)
        self.state.plant_pose.pop(bid, None)
        self.state.stored.append(bid)
        self._place_pollen_slot(bid, len(self.state.stored) - 1)

    def _stow_rear(self, bid: int) -> None:
        """Rear mixed FIFO compartment (nectar or pollen)."""
        if bid in self.state.rear_stored or len(self.state.rear_stored) >= C.NECTAR_HOPPER_CAPACITY:
            return
        if bid in self.state.stored:
            self.state.stored.remove(bid)
        self.state.planted.discard(bid)
        self.state.plant_pose.pop(bid, None)
        self.state.rear_stored.append(bid)
        self._place_rear_slot(bid, len(self.state.rear_stored) - 1)

    def _place_pollen_slot(self, bid: int, slot: int) -> None:
        slot = slot % len(C.HOPPER_LOCAL_SLOTS)
        local = np.array(C.HOPPER_LOCAL_SLOTS[slot], dtype=float)
        self._place_local(bid, local)

    def _place_rear_slot(self, bid: int, slot: int) -> None:
        slot = slot % len(C.NECTAR_HOPPER_LOCAL_SLOTS)
        local = np.array(C.NECTAR_HOPPER_LOCAL_SLOTS[slot], dtype=float)
        self._place_local(bid, local)

    def _place_local(self, bid: int, local: np.ndarray) -> None:
        R = self.data.xmat[self._robot_id].reshape(3, 3)
        origin = np.array(self.data.xpos[self._robot_id], dtype=float)
        world = origin + R @ local
        adr = self._qpos_adr[bid]
        self.data.qpos[adr : adr + 3] = world
        self.data.qpos[adr + 3 : adr + 7] = np.array([1.0, 0.0, 0.0, 0.0])
        vadr = self._qvel_adr[bid]
        self.data.qvel[vadr : vadr + 6] = 0.0

    def _set_free_pose(self, bid: int, xyz: np.ndarray, vel: np.ndarray | None = None) -> None:
        adr = self._qpos_adr[bid]
        self.data.qpos[adr : adr + 3] = xyz
        self.data.qpos[adr + 3 : adr + 7] = np.array([1.0, 0.0, 0.0, 0.0])
        vadr = self._qvel_adr[bid]
        if vel is None:
            self.data.qvel[vadr : vadr + 6] = 0.0
        else:
            self.data.qvel[vadr : vadr + 3] = vel
            self.data.qvel[vadr + 3 : vadr + 6] = 0.0

    def _hold_stored(self) -> None:
        for i, bid in enumerate(self.state.stored):
            self._place_pollen_slot(bid, i)
        for i, bid in enumerate(self.state.rear_stored):
            self._place_rear_slot(bid, i)

    def _nearest_flower(self) -> tuple[int, float, float, float]:
        """Return (index, fx, fy, dist_xy) of nearest flower to robot."""
        rxy = self._robot_xy()
        best_i = 0
        best_d = 1e9
        best_fx = self._flower_xy[0][0]
        best_fy = self._flower_xy[0][1]
        for i, (fx, fy) in enumerate(self._flower_xy):
            d = float(math.hypot(rxy[0] - fx, rxy[1] - fy))
            if d < best_d:
                best_d = d
                best_i = i
                best_fx, best_fy = fx, fy
        return best_i, best_fx, best_fy, best_d

    def _nectar_in_flower(self, fx: float, fy: float) -> list[int]:
        """Free (not hopper) nectar bodies near this flower cup."""
        r2 = (C.FLOWER_COLLAR_INNER_R + C.NECTAR_R) ** 2
        out: list[int] = []
        held = set(self.state.rear_stored)
        for bid in self._nectar_body_ids:
            if bid in held:
                continue
            pos = np.array(self.data.xpos[bid], dtype=float)
            if pos[2] > 2.5:
                continue
            if (pos[0] - fx) ** 2 + (pos[1] - fy) ** 2 <= r2 and pos[2] < 0.35:
                out.append(bid)
        return out

    def _pollen_in_flower(self, fx: float, fy: float) -> list[int]:
        r2 = (C.FLOWER_COLLAR_INNER_R + C.POLLEN_R) ** 2
        out: list[int] = []
        held = set(self.state.stored) | set(self.state.rear_stored)
        for bid in self._pollen_body_ids:
            if bid in held:
                continue
            pos = np.array(self.data.xpos[bid], dtype=float)
            if (pos[0] - fx) ** 2 + (pos[1] - fy) ** 2 <= r2 and 0.0 < pos[2] < 0.45:
                out.append(bid)
        return out

    def _hold_planted(self) -> None:
        """Keep planted nectar+pollen locked at exact flower-center stack poses."""
        for bid, (fx, fy, z) in list(self.state.plant_pose.items()):
            if bid not in self.state.planted:
                self.state.plant_pose.pop(bid, None)
                continue
            self._set_free_pose(bid, np.array([fx, fy, z], dtype=float))

    def _planted_in_flower(self, fx: float, fy: float) -> list[int]:
        """Planted bodies assigned to this flower, ordered bottom → top by Z."""
        out: list[tuple[float, int]] = []
        for bid, (px, py, z) in self.state.plant_pose.items():
            if bid not in self.state.planted:
                continue
            if (px - fx) ** 2 + (py - fy) ** 2 < 1e-6:
                out.append((z, bid))
        out.sort()
        return [b for _z, b in out]

    def _stack_center_zs(self, bids: list[int]) -> list[float]:
        """Cumulative center Z for a mixed nectar/pollen stack (bottom → top)."""
        zs: list[float] = []
        floor = C.TILE_THICKNESS + C.FLOWER_FLOOR_H + 0.001
        prev_r = 0.0
        z = floor
        for i, bid in enumerate(bids):
            r = self._ball_radius(bid)
            if i == 0:
                z = floor + r
            else:
                z = z + prev_r * 0.92 + r * 0.92
            zs.append(z)
            prev_r = r
        return zs

    def _apply_stack_poses(self, fx: float, fy: float, bids: list[int]) -> None:
        zs = self._stack_center_zs(bids)
        for bid, z in zip(bids, zs):
            self.state.plant_pose[bid] = (fx, fy, z)
            self._set_free_pose(bid, np.array([fx, fy, z], dtype=float))

    def try_place_nectar(self) -> str:
        """
        FIFO from rear compartment into nearest flower if within range;
        otherwise drop onto the field behind the robot.
        Returns: 'placed_nectar' | 'placed_pollen' | 'dropped_nectar' |
                 'dropped_pollen' | 'full' | 'empty'
        """
        if not self.state.rear_stored:
            return "empty"
        _i, fx, fy, dist = self._nearest_flower()
        kind = self._ball_kind(self.state.rear_stored[0])
        if dist <= C.FLOWER_PLACE_RANGE:
            already = self._planted_in_flower(fx, fy)
            if len(already) >= C.FLOWER_PLANT_CAPACITY:
                return "full"
            bid = self.state.rear_stored.pop(0)
            for i, b in enumerate(self.state.rear_stored):
                self._place_rear_slot(b, i)
            stack = already + [bid]
            self.state.planted.add(bid)
            self._apply_stack_poses(fx, fy, stack)
            return f"placed_{kind}"

        bid = self.state.rear_stored.pop(0)
        for i, b in enumerate(self.state.rear_stored):
            self._place_rear_slot(b, i)
        rear = self._nectar_intake_pos()
        back = -self._robot_x_axis()
        back[2] = 0.0
        n = float(np.linalg.norm(back)) + 1e-9
        back = back / n
        drop = rear + back * 0.12
        r = self._ball_radius(bid)
        drop[2] = max(drop[2], C.TILE_THICKNESS + r + 0.02)
        self._set_free_pose(bid, drop, vel=back * 0.9)
        self.state.planted.discard(bid)
        self.state.plant_pose.pop(bid, None)
        return f"dropped_{kind}"


    def _reverse_eject_rear(self) -> None:
        """Slow reverse outtake: FIFO drop one rear item behind the robot."""
        if not self.state.rear_stored:
            return
        if not hasattr(self, "_rev_cooldown"):
            self._rev_cooldown = 0.0
        if float(self.data.time) < self._rev_cooldown:
            return
        self._rev_cooldown = float(self.data.time) + 0.35
        bid = self.state.rear_stored.pop(0)
        rear = self._nectar_intake_pos()
        back = -self._robot_x_axis()
        back[2] = 0.0
        n = float(np.linalg.norm(back)) + 1e-9
        back = back / n
        self._set_free_pose(bid, rear + back * 0.08, vel=back * 1.2)
        self.state.planted.discard(bid)
        self.state.plant_pose.pop(bid, None)
        for i, b in enumerate(self.state.rear_stored):
            self._place_rear_slot(b, i)

    def _eject_one_pollen(self) -> None:
        if not self.state.stored:
            return
        bid = self.state.stored.pop(0)
        muzzle = self._muzzle_pos()
        elev = math.radians(C.SHOOT_ELEVATION_DEG)
        forward = self._robot_x_axis()
        forward[2] = 0.0
        nxy = float(np.linalg.norm(forward)) + 1e-9
        forward = forward / nxy
        direction = forward * math.cos(elev) + np.array([0.0, 0.0, math.sin(elev)])
        direction = direction / (np.linalg.norm(direction) + 1e-9)
        self._set_free_pose(bid, muzzle, vel=direction * C.SHOOT_SPEED)
        for i, b in enumerate(self.state.stored):
            self._place_pollen_slot(b, i)

    @property
    def count(self) -> int:
        return len(self.state.stored)

    @property
    def nectar_count(self) -> int:
        """Rear compartment count (mixed nectar+pollen). Kept name for HUD compat."""
        return len(self.state.rear_stored)

    @property
    def rear_count(self) -> int:
        return len(self.state.rear_stored)
