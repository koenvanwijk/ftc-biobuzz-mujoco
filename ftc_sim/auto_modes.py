"""
Sample autonomous OpModes — edit like FTC Blocks.

Each step in run_op_mode() is one “block”. Change order, power, or timing here.
"""

from __future__ import annotations

from .blocks import LinearOpMode


class LeaveAndGardenAuto(LinearOpMode):
    """
    Sample auto (red alliance start on -X wall):
      1. Leave wall (LEAVE points)
      2. Drive toward center / garden pollen corridor
      3. Nudge toward red garden pollen
      4. Stop

    Edit the sequence below exactly like stacking REV Blocks.
    """

    def run_op_mode(self) -> None:
        # --- Block: setPower briefly to unstick from wall ---
        self.drive.set_power(0.35, 0.35)
        self.sleep(400)
        self.drive.stop()

        # --- Block: drive.forward — leave perimeter ---
        self.telemetry_add("LEAVE: vooruit van de muur")
        self.drive.forward(1.2, power=0.45)

        # --- Block: turn toward red garden (-Y / -X corner) ---
        self.telemetry_add("Draai richting rode GARDEN")
        self.drive.turn(-35, power=0.35)

        # --- Block: drive toward garden pollen line ---
        self.telemetry_add("Rijd richting garden-pollen")
        self.drive.forward(1.5, power=0.4)

        # --- Block: small corrective turn + push ---
        self.drive.turn(-20, power=0.3)
        self.drive.forward(0.8, power=0.35)

        # --- Block: stop ---
        self.drive.stop()
        self.telemetry_add("Auto klaar")


class SpinTestAuto(LinearOpMode):
    """Minimal sanity OpMode: forward, turn, stop."""

    def run_op_mode(self) -> None:
        self.drive.forward(0.8, power=0.4)
        self.drive.turn(90, power=0.35)
        self.drive.forward(0.5, power=0.4)
        self.drive.stop()



class IntakeShootAuto(LinearOpMode):
    """Demo: leave wall, run intake briefly, arc-shoot preloaded pollen."""

    def run_op_mode(self) -> None:
        self.telemetry_add("Intake demo — preload hoppertellingen")
        self.drive.forward(0.6, power=0.35)
        self.intake.set_power(1.0)
        self.sleep(800)
        self.intake.set_power(0.0)
        for i in range(2):
            self.telemetry_add(f"Shoot #{i+1}")
            self.shooter.fire()
            self.sleep(400)
        self.drive.stop()
        self.telemetry_add("Intake/shoot demo klaar")


# Default OpMode used by `python -m ftc_sim.auto`
DEFAULT_AUTO = LeaveAndGardenAuto

