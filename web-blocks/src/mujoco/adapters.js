/**
 * Map FTC-commando's → MuJoCo actuators; joints → encoder/velocity sensors.
 *
 * Velocity-actuators: ctrl = gewenste hoeksnelheid (rad/s), NIET raw power.
 * Position-actuators (servo): ctrl = hoek (rad).
 * CRServo: velocity actuator vanuit power.
 *
 * Sensor-timing: sensors worden élke physics-stap bijgewerkt; de worker leest
 * de laatste snapshot bij elke clock-message (typisch 1 render-frame). Reads
 * zijn dus "laatste physics-stap", niet intra-step.
 */

import { readImuFromBody, computeAprilTagDetections } from './simSensors.js';

export class HardwareAdapter {
  constructor(mujoco, model, data, simConfig) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.cfg = simConfig;
    this._ids = Object.create(null);
    this._motorMeta = Object.create(null);

    const ACT = mujoco.mjtObj.mjOBJ_ACTUATOR.value;
    const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;

    const registerMotor = (entry) => {
      const actId = mujoco.mj_name2id(model, ACT, entry.actuator);
      const jntId = mujoco.mj_name2id(model, JNT, entry.joint);
      if (actId < 0 || jntId < 0) {
        console.warn('Motor mapping ontbreekt:', entry);
        return;
      }
      const ticksPerRev = (entry.encoderTicksPerRev || 28) * (entry.gearRatio || 1);
      const ticksPerRad = ticksPerRev / (2 * Math.PI);
      const maxRadPerSec =
        (((entry.maxMotorRpm || 6000) / 60) * 2 * Math.PI) / (entry.gearRatio || 1);
      const qposAdr = model.jnt_qposadr[jntId];
      const qvelAdr = model.jnt_dofadr[jntId];
      this._ids[entry.jsId] = { actId, jntId, kind: 'motor' };
      this._motorMeta[entry.jsId] = {
        ticksPerRad,
        maxRadPerSec,
        qposAdr,
        qvelAdr,
        invert: !!entry.invertEncoder,
        target: 0,
        tol: 10,
        mode: 'RUN_WITHOUT_ENCODER',
        zpb: 'BRAKE',
        encoderOffset: 0,
      };
    };

    registerMotor(simConfig.drive.left);
    registerMotor(simConfig.drive.right);
    registerMotor(simConfig.motors.flywheel);
    registerMotor(simConfig.motors.intakeMotor);

    const servo = simConfig.servos.pollenServo;
    this._ids[servo.jsId] = {
      actId: mujoco.mj_name2id(model, ACT, servo.actuator),
      jntId: mujoco.mj_name2id(model, JNT, servo.joint),
      kind: 'servo',
      range: servo.rangeRad || [-1.57, 1.57],
    };

    const cr = simConfig.crServos.crServo;
    this._ids[cr.jsId] = {
      actId: mujoco.mj_name2id(model, ACT, cr.actuator),
      jntId: mujoco.mj_name2id(model, JNT, cr.joint),
      kind: 'crServo',
      maxRadPerSec: cr.maxRadPerSec || 6.28,
    };

    this._aprilGen = 0;
    this._aprilJson = '[]';
    this._imuBody = 'chassis';
    this._imuJoint = 'root';
  }

  applyCommands(commands) {
    for (const cmd of Object.values(commands || {})) {
      if (!cmd) continue;
      const id = this._ids[cmd.jsId];
      if (!id || id.actId < 0) continue;

      if (cmd.type === 'motor') {
        const meta = this._motorMeta[cmd.jsId];
        meta.mode = cmd.mode;
        meta.zpb = cmd.zeroPowerBehavior;
        meta.target = cmd.targetPosition;
        meta.tol = cmd.targetTolerance;
        meta.encoderOffset = cmd.encoderOffsetTicks || 0;

        let radPerSec = 0;
        if (cmd.mode === 'RUN_TO_POSITION') {
          const s = this._motorSensor(cmd.jsId);
          const err = cmd.targetPosition - s.positionTicks;
          if (Math.abs(err) > cmd.targetTolerance) {
            const power = Math.max(-1, Math.min(1, err / 200));
            radPerSec = power * meta.maxRadPerSec;
          } else {
            radPerSec = 0;
          }
        } else if (cmd.velocityMode) {
          radPerSec = cmd.velocityTicksPerSec / meta.ticksPerRad;
        } else {
          const power = cmd.power || 0;
          if (power === 0) {
            // BRAKE: ctrl 0 met damping in model; FLOAT: ook 0 (MuJoCo heeft geen echte coast —
            // we verlagen kv niet runtime; gedocumenteerd als benadering).
            radPerSec = 0;
          } else {
            radPerSec = power * meta.maxRadPerSec;
          }
        }
        this.data.ctrl[id.actId] = radPerSec;
      } else if (cmd.type === 'servo') {
        const [lo, hi] = id.range;
        const angle = lo + (cmd.position01 ?? 0.5) * (hi - lo);
        this.data.ctrl[id.actId] = cmd.pwm === false ? this.data.ctrl[id.actId] : angle;
      } else if (cmd.type === 'crServo') {
        this.data.ctrl[id.actId] = (cmd.power || 0) * id.maxRadPerSec;
      }
    }
  }

  zeroAll() {
    for (let i = 0; i < this.model.nu; i++) this.data.ctrl[i] = 0;
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
      this._imuBody,
      this._imuJoint,
    );
    // Simple world has no apriltag_* sites — empty list (documented).
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
    return out;
  }

  _motorSensor(jsId) {
    const meta = this._motorMeta[jsId];
    const sign = meta.invert ? -1 : 1;
    const q = this.data.qpos[meta.qposAdr] * sign;
    const qd = this.data.qvel[meta.qvelAdr] * sign;
    const positionTicks = q * meta.ticksPerRad;
    const velocityTicksPerSec = qd * meta.ticksPerRad;
    const busy =
      meta.mode === 'RUN_TO_POSITION' &&
      Math.abs(meta.target - (positionTicks - meta.encoderOffset)) > meta.tol;
    return { positionTicks, velocityTicksPerSec, busy };
  }

  resetPose() {
    this.mujoco.mj_resetData(this.model, this.data);
    this.zeroAll();
    this.mujoco.mj_forward(this.model, this.data);
  }
}
