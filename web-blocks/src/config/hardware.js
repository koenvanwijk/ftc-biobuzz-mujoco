/** Exacte hardware-identifiers zoals de FTC Blocks-generator ze emitteert. */
export const CONFIG_NAME = 'REVStarterBot2026';

export const HARDWARE = {
  leftDrive: { jsId: 'leftDriveAsDcMotor', type: 'DcMotorEx', configName: 'leftDrive' },
  rightDrive: { jsId: 'rightDriveAsDcMotor', type: 'DcMotorEx', configName: 'rightDrive' },
  flywheel: { jsId: 'flywheelAsDcMotor', type: 'DcMotorEx', configName: 'flywheel' },
  intakeMotor: { jsId: 'intakeMotorAsDcMotor', type: 'DcMotorEx', configName: 'intakeMotor' },
  pollenServo: { jsId: 'pollenServoAsServo', type: 'Servo', configName: 'pollenServo' },
  crServo: { jsId: 'crServoAsCRServo', type: 'CRServo', configName: 'crServo' },
  ControlHubVoltage: {
    jsId: 'ControlHubAsVoltageSensor',
    type: 'VoltageSensor',
    configName: 'Control Hub',
  },
  ControlHubServo: {
    jsId: 'ControlHubAsServoController',
    type: 'ServoController',
    configName: 'Control Hub',
  },
  ControlHubModule: {
    jsId: 'ControlHubAsREVModule',
    type: 'REVModule',
    configName: 'Control Hub',
  },
  /** Simulated extension — config name `imu` → `imuAsIMU` (see extensions.md). */
  imu: { jsId: 'imuAsIMU', type: 'IMU', configName: 'imu', simulated: true },
  /** Simulated extension — webcam display name `Webcam 1` (VisionPortal / AprilTag). */
  webcam1: {
    jsId: 'Webcam1',
    type: 'WebcamName',
    configName: 'Webcam 1',
    simulated: true,
  },
};

export const MOTOR_JS_IDS = [
  'leftDriveAsDcMotor',
  'rightDriveAsDcMotor',
  'flywheelAsDcMotor',
  'intakeMotorAsDcMotor',
];

export const SERVO_JS_IDS = ['pollenServoAsServo'];
export const CRSERVO_JS_IDS = ['crServoAsCRServo'];

/** Default supply voltage for ControlHubAsVoltageSensor.getVoltage(). */
export const DEFAULT_SUPPLY_VOLTAGE = 12.5;
