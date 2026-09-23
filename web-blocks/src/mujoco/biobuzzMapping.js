/**
 * Pure helpers for BIOBUZZ soft-mechanism bridging (unit-testable).
 * Keep thresholds in sync with robots/BIOBUZZ/simulation.json.
 */

export const DEFAULT_THRESHOLDS = {
  intakeOn: 0.05,
  flywheelShoot: 0.3,
  pollenServoPlace: 0.7,
  crServoEject: 0.3,
};

/** Map intakeMotor power + crServo power → IntakeShooter.intakePower in {-1,0,1}. */
export function mapIntakePower(intakeMotorPower = 0, crServoPower = 0, thr = DEFAULT_THRESHOLDS) {
  let p = 0;
  if (intakeMotorPower > thr.intakeOn) p = 1;
  else if (intakeMotorPower < -thr.intakeOn) p = -1;
  if (Math.abs(crServoPower) > thr.crServoEject) p = -1;
  return p;
}

/** Rising-edge shoot: returns { fire, armed }. */
export function mapFlywheelEdge(power = 0, previouslyArmed = false, thr = DEFAULT_THRESHOLDS) {
  const high = Math.abs(power) > thr.flywheelShoot;
  if (high && !previouslyArmed) return { fire: true, armed: true };
  if (!high) return { fire: false, armed: false };
  return { fire: false, armed: true };
}

/** Rising-edge place when servo position01 crosses threshold. */
export function mapPollenServoEdge(position01 = 0.5, previouslyArmed = false, thr = DEFAULT_THRESHOLDS) {
  const high = position01 > thr.pollenServoPlace;
  if (high && !previouslyArmed) return { place: true, armed: true };
  if (!high) return { place: false, armed: false };
  return { place: false, armed: true };
}
