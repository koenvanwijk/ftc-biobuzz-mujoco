"""
Sample autonomous OpModes — edit like FTC Blocks.

Each step in run_op_mode() is one “block”. Change order, power, or timing here.
"""

from __future__ import annotations

from .blocks import LinearOpMode


class LeaveAndGardenAuto(LinearOpMode):
    """
    Voorbeeld-auto (rode alliantie). Start (G304): TILE A6, achterkant tegen de rode muur (−X),
    neus naar +X, achterzijde van het veld (+Y). De rode GARDEN ligt op A1 tegen de publieksmuur
    (−Y), dus aan het andere eind van de rode muur (manual Fig. 9-2 / Guide Fig. 6-2):
      1. LEAVE: vooruit van de muur (LEAVE-punten)
      2. kwartslag rechtsom: neus naar het publiek (−Y)
      3. langs de rode muur naar de GARDEN rijden (buiten de LOADING ZONE A5 en de FLOWER op naad 2/3)
      4. stoppen vóór de GARDEN

    turn() is tijd-gebaseerd; in MuJoCo draait de robot minder dan opgegeven (optrekken + slip):
    turn(-175) ≈ een kwartslag rechtsom. Pas het aan zoals je Blocks aanpast.
    """

    def run_op_mode(self) -> None:
        # --- Block: setPower briefly to unstick from wall ---
        self.drive.set_power(0.35, 0.35)
        self.sleep(400)
        self.drive.stop()

        # --- Block: drive.forward — leave perimeter ---
        self.telemetry_add("LEAVE: vooruit van de muur")
        self.drive.forward(0.4, power=0.45)

        # --- Block: kwartslag rechtsom (neus naar het publiek, −Y) ---
        self.telemetry_add("Draai rechtsom richting rode GARDEN (publiekszijde)")
        self.drive.turn(-175, power=0.35)

        # --- Block: langs de rode muur naar de GARDEN (A1) ---
        self.telemetry_add("Rijd langs de rode muur naar de GARDEN")
        self.drive.forward(6.2, power=0.4)

        # --- Block: stop ---
        self.drive.stop()
        self.telemetry_add("Auto klaar: vóór de rode GARDEN")


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

