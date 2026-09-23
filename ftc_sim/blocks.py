"""
REV Blocks-style autonomous layer (Python DSL).

Mirrors FTC Blocks / OnBot Java concepts:
  - LinearOpMode with init() / run_op_mode() sequential steps
  - setPower(left, right)
  - sleep(ms)
  - drive.forward(seconds) / drive.turn(degrees)

Edit sequences in auto_modes.py like stacking Blocks: one step after another.
"""

from __future__ import annotations

import math
import time
from abc import ABC, abstractmethod
from typing import Callable

import mujoco
import numpy as np

from . import constants as C
from .sim import set_tank_power, step, steps_for_seconds


class Drive:
    """Hardware-map style drive subsystem."""

    def __init__(self, opmode: "LinearOpMode") -> None:
        self._op = opmode

    def set_power(self, left: float, right: float) -> None:
        set_tank_power(self._op.model, self._op.data, left, right)

    def stop(self) -> None:
        self.set_power(0.0, 0.0)

    def forward(self, seconds: float, power: float = 0.5) -> None:
        """Drive forward for `seconds` at `power` (−1…1)."""
        self.set_power(power, power)
        self._op.sleep(int(seconds * 1000))
        self.stop()

    def backward(self, seconds: float, power: float = 0.5) -> None:
        self.forward(seconds, -abs(power))

    def turn(self, degrees: float, power: float = 0.4) -> None:
        """
        Approximate in-place turn.
        Positive degrees = counter-clockwise (left).
        Duration from track geometry: ω ≈ (2 * v_wheel) / track_width.
        """
        # linear wheel speed at |power|; timing uses practical MAX_YAW_RATE (MuJoCo spin ~that)
        v = abs(power) * C.MAX_LINEAR_VEL
        omega = min((2.0 * v) / C.TRACK_WIDTH, C.MAX_YAW_RATE)
        if omega < 1e-6:
            return
        seconds = abs(math.radians(degrees)) / omega
        direction = 1.0 if degrees >= 0 else -1.0
        # left+, right− → CCW
        self.set_power(-direction * abs(power), direction * abs(power))
        self._op.sleep(int(seconds * 1000))
        self.stop()




class Intake:
    """Blocks-style intake subsystem: intake.set_power(p)."""

    def __init__(self, opmode: "LinearOpMode") -> None:
        self._op = opmode

    def set_power(self, power: float) -> None:
        if self._op.mech is None:
            return
        self._op.mech.set_intake_power(power)


class Shooter:
    """Blocks-style shooter: shooter.fire() / shooter.set_power (pulse)."""

    def __init__(self, opmode: "LinearOpMode") -> None:
        self._op = opmode

    def fire(self) -> bool:
        if self._op.mech is None:
            return False
        ok = self._op.mech.fire()
        # Process eject on next sleep/step cycles via mech.update in sleep
        return ok

    def set_power(self, power: float) -> None:
        """Non-zero power queues a single fire (FTC motor-pulse style)."""
        if abs(power) > 0.1:
            self.fire()


class LinearOpMode(ABC):
    """FTC-style LinearOpMode running inside MuJoCo."""

    def __init__(
        self,
        model: mujoco.MjModel,
        data: mujoco.MjData,
        on_step: Callable[[], None] | None = None,
        realtime: bool = True,
    ) -> None:
        self.model = model
        self.data = data
        self.drive = Drive(self)
        self.intake = Intake(self)
        self.shooter = Shooter(self)
        self.mech = None  # set by auto/teleop runners
        self.hive_tip = None
        self.field_bounds = None
        self._on_step = on_step
        self._realtime = realtime
        self._op_mode_active = True
        self.telemetry: list[str] = []

    @abstractmethod
    def run_op_mode(self) -> None:
        """Place sequential Blocks here (like FTC Blocks linear mode)."""

    def init(self) -> None:
        """Optional INIT phase (sensors, servos). Default: no-op."""
        self.telemetry_add("INIT complete")

    def sleep(self, ms: int) -> None:
        """Block for milliseconds while stepping physics (like Blocks sleep)."""
        seconds = max(0.0, ms / 1000.0)
        n = steps_for_seconds(self.model, seconds)
        t0 = time.perf_counter()
        for _ in range(n):
            if not self._op_mode_active:
                break
            step(self.model, self.data, 1, mech=self.mech, hive_tip=self.hive_tip, field_bounds=self.field_bounds)
            if self._on_step:
                self._on_step()
            if self._realtime:
                # Pace to wall clock
                target = t0 + (_ + 1) * self.model.opt.timestep
                delay = target - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)

    def request_op_mode_stop(self) -> None:
        self._op_mode_active = False
        self.drive.stop()

    @property
    def op_mode_is_active(self) -> bool:
        return self._op_mode_active

    def telemetry_add(self, msg: str) -> None:
        self.telemetry.append(msg)
        print(f"[telemetry] {msg}")

    def run(self) -> None:
        self.init()
        self.telemetry_add(f"Running {self.__class__.__name__}")
        try:
            self.run_op_mode()
        finally:
            self.drive.stop()
            self.telemetry_add("OpMode gestopt")
