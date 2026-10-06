/**
 * Map REVStarterBot2026 FTC commands → BIOBUZZ MuJoCo + soft mechanisms.
 *
 * Drive: left_drive / right_drive via setTankPower + updateDriveSlew (teleop feel).
 * Soft (no MJCF joints):
 *   intakeMotor → IntakeShooter.intakePower (|p|>0.05; sign: +intake / −rear spit)
 *   flywheel    → edge-trigger IntakeShooter.fire when |power| rises above 0.3
 *   pollenServo → edge-trigger tryPlaceNectar when position01 rises above 0.7
 *   crServo     → while |power|>0.3 force reverse eject (overrides intakeMotor)
 *
 * Encoders: drive joints only; soft devices report 0 ticks (telemetry shows cmds).
 */
import {
  IntakeShooter,
  resetDriveState,
  setTankPower,
  updateDriveSlew,
  LEFT_DRIVE_SIGN,
  RIGHT_DRIVE_SIGN,
  electricalToWheelSticks,
} from '../worlds/biobuzz/mechanisms.js';
import { HiveTipController } from '../worlds/biobuzz/hive_tip.js';
import { FieldBoundsReturn } from '../worlds/biobuzz/field_bounds.js';
import { HOPPER_CAPACITY, NECTAR_HOPPER_CAPACITY } from '../worlds/biobuzz/constants.js';
import { mapIntakePower, mapFlywheelEdge, mapPollenServoEdge } from './biobuzzMapping.js';
import { readImuFromBody, computeAprilTagDetections } from './simSensors.js';

export class BiobuzzHardwareAdapter {
  constructor(mujoco, model, data, simConfig) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.cfg = simConfig;
    this._motorMeta = Object.create(null);
    this._lastCmds = Object.create(null);
    this._flyArmed = false;
    this._placeArmed = false;
    this._lastPlaceResult = '';
    this._lastShootOk = false;
    this._hud = { hopper: 0, nectar: 0, scoreRed: 0, scoreBlue: 0, intake: 'uit' };

    const thr = simConfig.thresholds || {};
    this._thr = {
      intakeOn: thr.intakeOn ?? 0.05,
      flywheelShoot: thr.flywheelShoot ?? 0.3,
      pollenServoPlace: thr.pollenServoPlace ?? 0.7,
      crServoEject: thr.crServoEject ?? 0.3,
    };

    const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
    const ACT = mujoco.mjtObj.mjOBJ_ACTUATOR.value;

    const registerDrive = (entry) => {
      const jntId = mujoco.mj_name2id(model, JNT, entry.joint);
      const actId = mujoco.mj_name2id(model, ACT, entry.actuator);
      if (jntId < 0 || actId < 0) {
        console.warn('BIOBUZZ drive mapping ontbreekt:', entry);
        return;
      }
      const ticksPerRev = (entry.encoderTicksPerRev || 28) * (entry.gearRatio || 1);
      const ticksPerRad = ticksPerRev / (2 * Math.PI);
      const maxRadPerSec =
        (((entry.maxMotorRpm || 6000) / 60) * 2 * Math.PI) / (entry.gearRatio || 1);
      this._motorMeta[entry.jsId] = {
        kind: 'drive',
        actId,
        ticksPerRad,
        maxRadPerSec,
        qposAdr: model.jnt_qposadr[jntId],
        qvelAdr: model.jnt_dofadr[jntId],
        invert: !!entry.invertEncoder,
        // Drive motors report encoders in the *electrical* motor frame (before FTC Direction):
        // a mirrored (LEFT) motor reads negative ticks when the wheel rolls forward.
        polaritySign: entry === simConfig.drive.left ? LEFT_DRIVE_SIGN : RIGHT_DRIVE_SIGN,
        dirSign: 1, // FTC Direction of the last command (REVERSE = -1)
        target: 0,
        tol: 10,
        mode: 'RUN_WITHOUT_ENCODER',
        encoderOffset: 0,
        side: entry === simConfig.drive.left ? 'left' : 'right',
      };
    };

    registerDrive(simConfig.drive.left);
    registerDrive(simConfig.drive.right);

    for (const entry of Object.values(simConfig.motors || {})) {
      this._motorMeta[entry.jsId] = {
        kind: 'soft',
        ticksPerRad: 1,
        maxRadPerSec: 1,
        qposAdr: -1,
        qvelAdr: -1,
        invert: false,
        target: 0,
        tol: 10,
        mode: 'RUN_WITHOUT_ENCODER',
        encoderOffset: 0,
        softRole: entry.configName,
      };
    }

    this.mech = new IntakeShooter(mujoco, model, data);
    this.hiveTip = new HiveTipController(mujoco, model, data);
    this.fieldBounds = new FieldBoundsReturn(mujoco, model, data);
    this.mech.resetAndPreload();
    this.hiveTip.reset();
    this._aprilGen = 0;
    this._aprilJson = '[]';
    this._refreshHud();
  }

  applyCommands(commands) {
    this._lastCmds = commands || {};
    const leftMeta = this._motorMeta.leftDriveAsDcMotor;
    const rightMeta = this._motorMeta.rightDriveAsDcMotor;
    let leftElec = 0; // post-Direction electrical motor power [-1,1]
    let rightElec = 0;

    const leftCmd = this._lastCmds.leftDriveAsDcMotor;
    const rightCmd = this._lastCmds.rightDriveAsDcMotor;

    if (leftCmd?.type === 'motor' && leftMeta) {
      leftMeta.mode = leftCmd.mode;
      leftMeta.target = leftCmd.targetPosition;
      leftMeta.tol = leftCmd.targetTolerance;
      leftMeta.encoderOffset = leftCmd.encoderOffsetTicks || 0;
      leftMeta.dirSign = leftCmd.direction === 'REVERSE' ? -1 : 1;
      leftMeta.driving = rtpDriving(leftCmd);
      leftElec = this._motorPower01(leftCmd, leftMeta);
    }
    if (rightCmd?.type === 'motor' && rightMeta) {
      rightMeta.mode = rightCmd.mode;
      rightMeta.target = rightCmd.targetPosition;
      rightMeta.tol = rightCmd.targetTolerance;
      rightMeta.encoderOffset = rightCmd.encoderOffsetTicks || 0;
      rightMeta.dirSign = rightCmd.direction === 'REVERSE' ? -1 : 1;
      rightMeta.driving = rtpDriving(rightCmd);
      rightElec = this._motorPower01(rightCmd, rightMeta);
    }

    // Real robot: left motor is mirrored (default leftDrive REVERSE, rightDrive FORWARD).
    // Map post-Direction electrical power → logical wheel sticks (+ = forward).
    const sticks = electricalToWheelSticks(leftElec, rightElec);
    setTankPower(this.data, sticks.left, sticks.right);

    // Soft mechanisms
    const intakeCmd = this._lastCmds.intakeMotorAsDcMotor;
    const crCmd = this._lastCmds.crServoAsCRServo;
    const flyCmd = this._lastCmds.flywheelAsDcMotor;
    const servoCmd = this._lastCmds.pollenServoAsServo;

    const intakePower = mapIntakePower(
      intakeCmd?.type === 'motor' ? intakeCmd.power || 0 : 0,
      crCmd?.type === 'crServo' ? crCmd.power || 0 : 0,
      this._thr,
    );
    this.mech.setIntakePower(intakePower);

    const fly = mapFlywheelEdge(flyCmd?.power || 0, this._flyArmed, this._thr);
    this._flyArmed = fly.armed;
    if (fly.fire) this._lastShootOk = this.mech.fire();

    const place = mapPollenServoEdge(servoCmd?.position01 ?? 0.5, this._placeArmed, this._thr);
    this._placeArmed = place.armed;
    if (place.place) this._lastPlaceResult = this.mech.tryPlaceNectar();
  }

  /** Convert motor command to stick-like [-1,1] for setTankPower. */
  _motorPower01(cmd, meta) {
    if (cmd.mode === 'RUN_TO_POSITION') {
      // Target/position are in the FTC-Direction frame; return electrical power (× dirSign).
      // FTC: |power| (or |velocity|) is the max speed toward the target; the sign is ignored; 0 = no motion.
      const maxP = rtpMaxPower(cmd, meta);
      if (maxP <= 0) return 0;
      const s = this._motorSensor(cmd.jsId);
      const logicalPos = (s.positionTicks - (cmd.encoderOffsetTicks || 0)) * meta.dirSign;
      const err = cmd.targetPosition - logicalPos;
      if (Math.abs(err) > (cmd.targetTolerance ?? meta.tol)) {
        return meta.dirSign * Math.max(-maxP, Math.min(maxP, err / 200));
      }
      return 0;
    }
    if (cmd.velocityMode) {
      const rad = (cmd.velocityTicksPerSec || 0) / meta.ticksPerRad;
      return Math.max(-1, Math.min(1, rad / meta.maxRadPerSec));
    }
    return Math.max(-1, Math.min(1, cmd.power || 0));
  }

  /** Call once per physics substep (before mj_step). */
  physicsTick(dt) {
    this.mech.update();
    this.fieldBounds.setProtected(this.mech.protectedBodyIds());
    this.hiveTip.update();
    this.fieldBounds.update();
    updateDriveSlew(this.data, dt);
    this._refreshHud();
  }

  /** Idle teleop: tank sticks + intake/shoot/place from BIOBUZZ InputHandler cmd. */
  applyTeleop(cmd) {
    if (!cmd) return;
    setTankPower(this.data, cmd.left || 0, cmd.right || 0);
    this.mech.setIntakePower(cmd.intake || 0);
    if (cmd.shoot) this._lastShootOk = this.mech.fire();
    if (cmd.placeNectar) this._lastPlaceResult = this.mech.tryPlaceNectar();
  }

  zeroAll() {
    resetDriveState();
    setTankPower(this.data, 0, 0);
    updateDriveSlew(this.data, 1); // snap toward 0
    for (let i = 0; i < this.model.nu; i++) this.data.ctrl[i] = 0;
    this.mech.setIntakePower(0);
    this.mech.shootQueued = false;
    this._flyArmed = false;
    this._placeArmed = false;
    this._lastCmds = Object.create(null);
  }

  readSensors() {
    const out = Object.create(null);
    for (const jsId of Object.keys(this._motorMeta)) {
      out[jsId] = this._motorSensor(jsId);
    }
    out.imuAsIMU = readImuFromBody(
      this.mujoco,
      this.model,
      this.data,
      'robot',
      'robot_free',
    );
    const april = computeAprilTagDetections(this.mujoco, this.model, this.data, {
      cameraSiteName: 'robot_up_cam',
      maxRangeM: 2.5,
      fovyDeg: 70,
      minFacingDot: 0.55,
    });
    if (april.json !== this._aprilJson) {
      this._aprilJson = april.json;
      this._aprilGen = (this._aprilGen || 0) + 1;
    }
    out.aprilTagDetections = {
      json: april.json,
      generation: this._aprilGen || 0,
      count: april.detections.length,
    };
    this._aprilCount = april.detections.length;
    return out;
  }

  _motorSensor(jsId) {
    const meta = this._motorMeta[jsId];
    if (!meta || meta.kind === 'soft' || meta.qposAdr < 0) {
      return { positionTicks: 0, velocityTicksPerSec: 0, busy: false };
    }
    const sign = (meta.invert ? -1 : 1) * (meta.polaritySign ?? 1);
    const q = this.data.qpos[meta.qposAdr] * sign;
    const qd = this.data.qvel[meta.qvelAdr] * sign;
    const positionTicks = q * meta.ticksPerRad;
    const velocityTicksPerSec = qd * meta.ticksPerRad;
    const dirSign = meta.dirSign ?? 1;
    const busy =
      meta.mode === 'RUN_TO_POSITION' &&
      meta.driving !== false &&
      Math.abs(meta.target - (positionTicks - meta.encoderOffset) * dirSign) > meta.tol;
    return { positionTicks, velocityTicksPerSec, busy };
  }

  resetPose() {
    this.mujoco.mj_resetDataKeyframe(this.model, this.data, 0);
    resetDriveState();
    this.zeroAll();
    this.mech.resetAndPreload();
    this.hiveTip.reset();
    this.mujoco.mj_forward(this.model, this.data);
    this._refreshHud();
  }

  _refreshHud() {
    this._hud = {
      hopper: this.mech.count,
      hopperCap: HOPPER_CAPACITY,
      nectar: this.mech.nectarCount,
      nectarCap: NECTAR_HOPPER_CAPACITY,
      scoreRed: this.hiveTip.score?.red ?? 0,
      scoreBlue: this.hiveTip.score?.blue ?? 0,
      intake:
        this.mech.intakePower > 0.05
          ? 'AAN'
          : this.mech.intakePower < -0.05
            ? 'UIT (achter)'
            : 'uit',
      lastPlace: this._lastPlaceResult,
      lastShoot: this._lastShootOk,
      hiveEvent: this.hiveTip.lastEvent || '',
      aprilCount: this._aprilCount || 0,
    };
    if (this.hiveTip.lastEvent) this.hiveTip.lastEvent = '';
  }

  getHud() {
    return { ...this._hud, aprilCount: this._aprilCount || 0 };
  }

  /** Extra telemetry lines for soft-bridge visibility. */
  mechanismTelemetryText() {
    const h = this._hud;
    const lines = [
      `BIOBUZZ hopper ${h.hopper}/${h.hopperCap}  rearFIFO ${h.nectar}/${h.nectarCap}`,
      `score R${h.scoreRed} B${h.scoreBlue}  intake ${h.intake}`,
    ];
    if (h.lastPlace) lines.push(`place: ${h.lastPlace}`);
    if (h.hiveEvent) lines.push(h.hiveEvent);
    return lines.join('\n');
  }
}

/** RUN_TO_POSITION max |power| [0,1]: |power|, or |velocity| as a fraction of max speed. */
function rtpMaxPower(cmd, meta) {
  if (cmd.enabled === false) return 0;
  if (cmd.velocityMode) {
    const rad = Math.abs(cmd.velocityTicksPerSec || 0) / (meta.ticksPerRad || 1);
    return Math.min(1, rad / (meta.maxRadPerSec || 1));
  }
  return Math.min(1, Math.abs(cmd.power || 0));
}

/** True when a RUN_TO_POSITION command actually drives (FTC isBusy needs power ≠ 0). */
function rtpDriving(cmd) {
  if (cmd.enabled === false) return false;
  return cmd.velocityMode ? (cmd.velocityTicksPerSec || 0) !== 0 : (cmd.power || 0) !== 0;
}
