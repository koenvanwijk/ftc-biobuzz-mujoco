"""Gamepad (pygame) + keyboard fallback for tank drive, intake, shooter."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TankCommand:
    left: float = 0.0
    right: float = 0.0
    intake: float = 0.0  # +1 latched on, -1 C/LB rear FIFO outtake while held
    shoot: bool = False  # one-shot edge (SPACE / F / right trigger)
    place_nectar: bool = False  # X — FIFO rear (nectar/pollen) into flower or drop
    quit: bool = False
    reset: bool = False


class InputHandler:
    """
    Tank drive + mechanisms:
      - Intake latched ON by default; E / R1 (RB) toggles — not R2
      - C / L1 (LB) = rear FIFO reverse outtake while held
      - SPACE / F / R2 (RT) = shoot
      - X / gamepad X = FIFO rear → flower stack (or drop on field)
    """

    def __init__(self) -> None:
        import pygame

        self.pygame = pygame
        pygame.init()
        pygame.display.set_mode((360, 100))
        pygame.display.set_caption("FTC BIOBUZZ controls (focus for keyboard)")
        pygame.joystick.init()
        self.joy = None
        if pygame.joystick.get_count() > 0:
            self.joy = pygame.joystick.Joystick(0)
            self.joy.init()
            print(f"[controls] Gamepad: {self.joy.get_name()}")
        else:
            print(
                "[controls] Geen gamepad — W/S links, I/K rechts; "
                "E=intake toggle; C=achter uit; SPACE/F=shoot; "
                "X=FIFO achter→bloem; G=bloemen vullen; T=arcade; R=reset"
            )

        self._arcade = False
        self._prev_shoot_btn = False
        self._prev_intake_toggle = False
        self._prev_place_btn = False
        self._intake_on = True  # stays on until toggled off

    def poll(self) -> TankCommand:
        pygame = self.pygame
        cmd = TankCommand()
        shoot_edge = False
        place_edge = False

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                cmd.quit = True
            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    cmd.quit = True
                elif event.key == pygame.K_r:
                    cmd.reset = True
                elif event.key == pygame.K_t:
                    self._arcade = not self._arcade
                    print(f"[controls] Mode: {'arcade' if self._arcade else 'tank'}")
                elif event.key in (pygame.K_SPACE, pygame.K_f):
                    shoot_edge = True
                elif event.key == pygame.K_e:
                    self._intake_on = not self._intake_on
                    print(f"[controls] Intake: {'AAN' if self._intake_on else 'uit'}")
                elif event.key == pygame.K_x:
                    place_edge = True

        left = right = 0.0
        reverse = False
        if self.joy is not None:
            ly = -self._axis(1)
            rx = self._axis(2)
            ry = -self._axis(3)
            if abs(ry) < 0.05 and self.joy.get_numaxes() > 4:
                ry = -self._axis(4)
            dead = 0.12
            ly = 0.0 if abs(ly) < dead else ly
            ry = 0.0 if abs(ry) < dead else ry
            rx = 0.0 if abs(rx) < dead else rx
            if self._arcade or (abs(ry) < dead and abs(rx) > dead):
                throttle, turn = ly, rx
                left = throttle + turn
                right = throttle - turn
            else:
                left, right = ly, ry

            # R1/RB (5) only — R2/RT (7) is shoot, must not toggle intake
            rb = self.joy.get_numbuttons() > 5 and bool(self.joy.get_button(5))
            if rb and not self._prev_intake_toggle:
                self._intake_on = not self._intake_on
                print(f"[controls] Intake: {'AAN' if self._intake_on else 'uit'}")
            self._prev_intake_toggle = rb

            # L1/LB (4) only
            if self.joy.get_numbuttons() > 4 and self.joy.get_button(4):
                reverse = True

            # R2/RT = shoot (axis and/or button 7)
            trigger = 0.0
            if self.joy.get_numaxes() > 5:
                trigger = self._axis(5)
            trig_pressed = (
                trigger > 0.4
                or (self.joy.get_numaxes() > 4 and self._axis(4) > 0.5)
                or (self.joy.get_numbuttons() > 7 and bool(self.joy.get_button(7)))
            )
            if trig_pressed and not self._prev_shoot_btn:
                shoot_edge = True
            self._prev_shoot_btn = bool(trig_pressed)

            # Xbox X / button index 2 — place nectar
            place_btn = self.joy.get_numbuttons() > 2 and self.joy.get_button(2)
            if place_btn and not self._prev_place_btn:
                place_edge = True
            self._prev_place_btn = bool(place_btn)
        else:
            keys = pygame.key.get_pressed()
            if self._arcade or keys[pygame.K_a] or keys[pygame.K_d] or keys[pygame.K_LEFT] or keys[pygame.K_RIGHT]:
                throttle = (1.0 if keys[pygame.K_w] or keys[pygame.K_UP] else 0.0) + (
                    -1.0 if keys[pygame.K_s] or keys[pygame.K_DOWN] else 0.0
                )
                turn = (1.0 if keys[pygame.K_d] or keys[pygame.K_RIGHT] else 0.0) + (
                    -1.0 if keys[pygame.K_a] or keys[pygame.K_LEFT] else 0.0
                )
                left = throttle + turn
                right = throttle - turn
            else:
                if keys[pygame.K_w]:
                    left += 1.0
                if keys[pygame.K_s]:
                    left -= 1.0
                if keys[pygame.K_i] or keys[pygame.K_UP]:
                    right += 1.0
                if keys[pygame.K_k] or keys[pygame.K_DOWN]:
                    right -= 1.0
            if keys[pygame.K_c]:
                reverse = True

        m = max(abs(left), abs(right), 1.0)
        cmd.left = left / m
        cmd.right = right / m
        cmd.intake = -1.0 if reverse else (1.0 if self._intake_on else 0.0)
        cmd.shoot = shoot_edge
        cmd.place_nectar = place_edge
        return cmd

    def _axis(self, i: int) -> float:
        if self.joy is None or i >= self.joy.get_numaxes():
            return 0.0
        return float(self.joy.get_axis(i))

    def close(self) -> None:
        self.pygame.quit()
