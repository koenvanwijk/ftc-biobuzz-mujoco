# Support matrix — FTC Blocks → MuJoCo sim

Legenda: **W** = working · **P** = partial · **U** = unsupported (faalt luid)

| Feature-groep | Status | Notities |
|---------------|--------|----------|
| LinearOpMode waitForStart / start / stop | W | Worker async + host knoppen |
| sleep / idle (sim clock) | W | Deelt physics-tijd |
| opModeIsActive / isStopRequested | W | |
| DcMotor set/get Power, Direction, ZPB | W | |
| setDualPower / Mode / TargetPosition | W | |
| Encoders getCurrentPosition | W | Uit joint qpos × ticksPerRad |
| STOP_AND_RESET_ENCODER | W | Offset in bridge |
| RUN_TO_POSITION + isBusy | P | Eenvoudige P-achtige nadering, geen echte PID |
| setVelocity / getVelocity | P | ticks/s ↔ rad/s via simulation.json |
| PIDF / current alerts | U | Expliciete Error |
| Servo position / direction / scaleRange | W | Position actuator |
| CRServo power / direction | W | Velocity actuator (geen positie) |
| gamepad1/2 sticks & buttons | W | Gamepad API + toetsenbord/UI, deadzone 0.05 |
| gamepad rumble / LED effects | U | |
| telemetry addData / addLine / update / clear | W | |
| telemetry.speak | U | throw |
| ControlHub voltage | W | Vaste configureerbare spanning |
| ServoController pwm enable/status | P | State only |
| REVModule bulk caching | P | Stub methodes |
| Webcam / Vision / AprilTag | P | **Simulated extension**: VisionPortal stubs + synthetic AprilTags (BIOBUZZ sites). Camera controls (exposure/focus/gain/WB/PTZ) are no-op stubs. Geen echte CV. |
| IMU (imuAsIMU) | P | **Simulated extension**: yaw/pitch/roll + ω from MuJoCo body quat; `resetYaw` offset. |
| Infinite loop zonder UI-freeze | W | Interpreter budget in worker |
| .blk export/import | W | Via bridge + Extra XML |
| Java export | W | Vendor `generateJavaCode()` |
| Hardware XML import | P | Parser + missingSimBindings; fixed config blijft default |
| Physics-nauwkeurigheid | P | Vereenvoudigd model, niet gevalideerd |


## BIOBUZZ soft mechanisms vs joint actuators

| Device | Simple world | BIOBUZZ world |
|--------|--------------|---------------|
| left/rightDrive | velocity joint actuators | `left_drive`/`right_drive` + slew (W) |
| intakeMotor | velocity joint | soft `IntakeShooter.intakePower` (P — no encoder joint) |
| flywheel | velocity joint | soft shoot edge-trigger (P) |
| pollenServo | position joint | soft place edge-trigger (P) |
| crServo | velocity joint | soft rear eject while powered (P) |
| Hive tip / scoring | n/a | W (copied controllers) |
| Idle keyboard teleop | gamepad1 overrides only | Full BIOBUZZ teleop when OpMode idle (W) |
