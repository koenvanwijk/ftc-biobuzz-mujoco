import { SimClock } from './simClock.js';
import { Telemetry, telemetryAddTextData } from './telemetry.js';
import { GamepadBridge, bindGamepadMethods } from './gamepad.js';
import { DcMotorBridge, wrapDcMotor } from './dcMotor.js';
import { ServoBridge } from './servo.js';
import { CRServoBridge } from './crServo.js';
import { LinearOpModeBridge } from './linearOpMode.js';
import { VoltageSensorBridge, ServoControllerBridge, RevModuleBridge } from './hub.js';
import {
  startBlockExecution,
  endBlockExecution,
  listLength,
  listIsEmpty,
  miscAccess,
  nullOrJson,
  evalIfTruthy,
} from './helpers.js';
import { CommandBus } from './commandBus.js';
import { HARDWARE, DEFAULT_SUPPLY_VOLTAGE } from '../config/hardware.js';
import { createImuAsIMU } from './imu.js';
import { yawPitchRollAnglesAccess } from './yawPitchRollAngles.js';
import { createAprilTagAccess } from './aprilTag.js';
import {
  createVisionPortalAccess,
  navigationAccess,
  bno055imuParametersAccess,
  imuParametersAccess,
  revHubOrientationOnRobotAccess,
  exposureControlAccess,
  gainControlAccess,
  focusControlAccess,
  whiteBalanceControlAccess,
  ptzControlAccess,
} from './visionPortal.js';

/**
 * Bouwt alle objecten met exacte generator-identifiers.
 * @param {object} simConfig simulation.json
 * @param {{ onTelemetry?: (s:string)=>void, onOpModeState?: (s:object)=>void }} hooks
 */
export function createRuntime(simConfig, hooks = {}) {
  const clock = new SimClock();
  const bus = new CommandBus();
  const telemetry = new Telemetry(hooks.onTelemetry);
  const linearOpMode = new LinearOpModeBridge(clock, { onStateChange: hooks.onOpModeState });

  const motorLimitsFrom = (entry) => {
    const ticksPerRev = (entry.encoderTicksPerRev || 28) * (entry.gearRatio || 1);
    const ticksPerRad = ticksPerRev / (2 * Math.PI);
    const maxRadPerSec = ((entry.maxMotorRpm || 6000) / 60) * 2 * Math.PI / (entry.gearRatio || 1);
    return { ticksPerRad, maxRadPerSec, ticksPerRev };
  };

  const makeMotor = (entry) => {
    const limits = motorLimitsFrom(entry);
    const raw = new DcMotorBridge(entry.jsId, {
      publishCommand: (c) => bus.publish(c),
      readSensor: () => bus.readSensor(entry.jsId),
      limits,
    });
    return wrapDcMotor(raw);
  };

  const motors = {
    leftDriveAsDcMotor: makeMotor(simConfig.drive.left),
    rightDriveAsDcMotor: makeMotor(simConfig.drive.right),
    flywheelAsDcMotor: makeMotor(simConfig.motors.flywheel),
    intakeMotorAsDcMotor: makeMotor(simConfig.motors.intakeMotor),
  };

  const pollenServoAsServo = new ServoBridge(
    HARDWARE.pollenServo.jsId,
    {
      publishCommand: (c) => bus.publish(c),
      initialPosition: simConfig.servos.pollenServo.initialPosition ?? 0.5,
    },
  );

  const crServoAsCRServo = new CRServoBridge(HARDWARE.crServo.jsId, {
    publishCommand: (c) => bus.publish(c),
  });

  const ControlHubAsVoltageSensor = new VoltageSensorBridge(
    simConfig.supplyVoltage ?? DEFAULT_SUPPLY_VOLTAGE,
  );
  const ControlHubAsServoController = new ServoControllerBridge();
  const ControlHubAsREVModule = new RevModuleBridge();

  const gamepad1 = bindGamepadMethods(new GamepadBridge(0));
  const gamepad2 = bindGamepadMethods(new GamepadBridge(1));

  const imuAsIMU = createImuAsIMU(() => bus.readSensor('imuAsIMU'));
  const aprilTagAccess = createAprilTagAccess(() => bus.readSensor('aprilTagDetections'));
  const visionPortalAccess = createVisionPortalAccess();

  function zeroActuators() {
    for (const m of Object.values(motors)) m.zero?.();
    crServoAsCRServo.zero();
    bus.zeroAllActuators();
  }

  function resetAll() {
    bus.clear();
    clock.reset();
    linearOpMode.resetForInit();
    telemetry.clear();
    zeroActuators();
    imuAsIMU._bridge._yawOffsetRad = 0;
    aprilTagAccess._resetFresh?.();
    for (const m of Object.values(motors)) m.zero?.();
    crServoAsCRServo.zero();
    pollenServoAsServo.setPosition(simConfig.servos.pollenServo.initialPosition ?? 0.5);
  }

  const bindings = {
    linearOpMode,
    telemetry,
    gamepad1,
    gamepad2,
    ...motors,
    pollenServoAsServo,
    crServoAsCRServo,
    ControlHubAsVoltageSensor,
    ControlHubAsServoController,
    ControlHubAsREVModule,
    imuAsIMU,
    aprilTagAccess,
    visionPortalAccess,
    exposureControlAccess,
    gainControlAccess,
    focusControlAccess,
    whiteBalanceControlAccess,
    ptzControlAccess,
    yawPitchRollAnglesAccess,
    navigationAccess,
    bno055imuParametersAccess,
    imuParametersAccess,
    revHubOrientationOnRobotAccess,
    miscAccess,
    startBlockExecution,
    endBlockExecution,
    nullOrJson,
    evalIfTruthy,
    listLength: (misc, list) => listLength(misc, list),
    listIsEmpty: (misc, list) => listIsEmpty(misc, list),
    telemetryAddTextData: (key, text) => telemetryAddTextData(telemetry, key, text),
  };

  return {
    clock,
    bus,
    telemetry,
    linearOpMode,
    gamepad1,
    gamepad2,
    motors,
    pollenServoAsServo,
    crServoAsCRServo,
    imuAsIMU,
    aprilTagAccess,
    visionPortalAccess,
    bindings,
    zeroActuators,
    resetAll,
    HARDWARE,
  };
}
