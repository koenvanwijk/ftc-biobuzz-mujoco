/**
 * OpMode-worker: JS-Interpreter met instructiebudget + native FTC-bindings.
 * Sleep/waitForStart gebruiken de simulatietijd van de host (niet wall-clock).
 */
/* eslint-disable no-undef */

let interpreter = null;
let stopFlag = false;
let simTimeSec = 0;
let started = false;
let stopRequested = false;
let pendingAsync = null; // { kind, until?, resume }
let lastLabel = '';
let commandBuffer = Object.create(null);
let sensorState = Object.create(null);
let gamepadState = { g1: {}, g2: {} };
let supplyVoltage = 12.5;
const BUDGET = 5000;
/** @type {Map<string, object>} native motor API by jsId for setDual* */
const motorApiById = new Map();

self.onmessage = (ev) => {
  const msg = ev.data || {};
  switch (msg.type) {
    case 'loadInterpreter':
      try {
        importScripts(msg.acornUrl, msg.interpreterUrl);
        self.postMessage({ type: 'ready' });
      } catch (e) {
        self.postMessage({ type: 'error', message: String(e) });
      }
      break;
    case 'init':
      stopFlag = false;
      stopRequested = false;
      started = false;
      simTimeSec = 0;
      pendingAsync = null;
      commandBuffer = Object.create(null);
      motorApiById.clear();
      sensorState = msg.sensors || Object.create(null);
      supplyVoltage = msg.supplyVoltage ?? 12.5;
      try {
        startOpMode(msg.code || '');
        self.postMessage({ type: 'status', phase: 'INIT', label: lastLabel });
        pump();
      } catch (e) {
        self.postMessage({
          type: 'error',
          message: e.message || String(e),
          label: lastLabel,
        });
      }
      break;
    case 'start':
      started = true;
      if (pendingAsync?.kind === 'waitForStart') {
        const r = pendingAsync.resume;
        pendingAsync = null;
        r();
      }
      self.postMessage({ type: 'status', phase: 'RUN' });
      pump();
      break;
    case 'stop':
      stopRequested = true;
      stopFlag = true;
      if (pendingAsync) {
        const r = pendingAsync.resume;
        pendingAsync = null;
        try { r(); } catch (_) { /* ignore */ }
      }
      zeroCommands();
      flushCommands();
      self.postMessage({ type: 'status', phase: 'STOP' });
      self.postMessage({ type: 'done', reason: 'stop' });
      break;
    case 'clock':
      simTimeSec = msg.timeSec;
      sensorState = msg.sensors || sensorState;
      gamepadState = msg.gamepads || gamepadState;
      if (pendingAsync?.kind === 'sleep' && simTimeSec >= pendingAsync.until) {
        const r = pendingAsync.resume;
        pendingAsync = null;
        r();
      }
      if (!stopFlag) pump();
      break;
    case 'gamepads':
      gamepadState = msg.gamepads || gamepadState;
      break;
    default:
      break;
  }
};

function startOpMode(code) {
  const initFunc = (interp, globalObject) => {
    const wrapMotor = (jsId) => createMotorPseudo(interp, globalObject, jsId);
    const motors = [
      'leftDriveAsDcMotor',
      'rightDriveAsDcMotor',
      'flywheelAsDcMotor',
      'intakeMotorAsDcMotor',
    ];
    for (const id of motors) {
      interp.setProperty(globalObject, id, wrapMotor(id));
    }
    interp.setProperty(globalObject, 'pollenServoAsServo', createServoPseudo(interp, 'pollenServoAsServo'));
    interp.setProperty(globalObject, 'crServoAsCRServo', createCrServoPseudo(interp, 'crServoAsCRServo'));
    interp.setProperty(globalObject, 'linearOpMode', createLinearOpModePseudo(interp));
    interp.setProperty(globalObject, 'telemetry', createTelemetryPseudo(interp));
    interp.setProperty(globalObject, 'gamepad1', createGamepadPseudo(interp, 'g1'));
    interp.setProperty(globalObject, 'gamepad2', createGamepadPseudo(interp, 'g2'));
    interp.setProperty(
      globalObject,
      'ControlHubAsVoltageSensor',
      createVoltagePseudo(interp),
    );
    interp.setProperty(
      globalObject,
      'ControlHubAsServoController',
      createServoControllerPseudo(interp),
    );
    interp.setProperty(
      globalObject,
      'ControlHubAsREVModule',
      createRevModulePseudo(interp),
    );

    interp.setProperty(
      globalObject,
      'startBlockExecution',
      interp.createNativeFunction((label) => {
        lastLabel = String(label);
        return true;
      }),
    );
    interp.setProperty(
      globalObject,
      'endBlockExecution',
      interp.createNativeFunction((result) => result),
    );
    interp.setProperty(
      globalObject,
      'telemetryAddTextData',
      interp.createNativeFunction((key, text) => {
        self.postMessage({ type: 'telemetryAdd', key: String(key), value: String(text) });
      }),
    );
    const miscNative = createMiscAccessNative();
    const misc = wrapNativeAccess(interp, miscNative);
    // evalIfTruthy evaluates generated expressions in the worker global scope.
    self.miscAccess = miscNative;
    interp.setProperty(globalObject, 'miscAccess', misc);
    interp.setProperty(
      globalObject,
      'listLength',
      interp.createNativeFunction((_m, list) => {
        const arr = interp.pseudoToNative(list);
        return arr && arr.length ? arr.length : 0;
      }),
    );
    interp.setProperty(
      globalObject,
      'listIsEmpty',
      interp.createNativeFunction((_m, list) => {
        const arr = interp.pseudoToNative(list);
        return !arr || !arr.length;
      }),
    );

    // Simulated IMU + Vision (explicit simulator extensions)
    bindSimulatedSensors(interp, globalObject);

    // Auto-call runOpMode after definitions
  };

  const wrapped =
    code +
    '\n; if (typeof runOpMode === "function") { runOpMode(); }\n';
  interpreter = new Interpreter(wrapped, initFunc);
}

function pump() {
  if (!interpreter || stopFlag) return;
  if (pendingAsync) {
    flushCommands();
    return;
  }
  try {
    for (let i = 0; i < BUDGET; i++) {
      if (stopFlag || pendingAsync) break;
      const ok = interpreter.step();
      if (!ok) {
        flushCommands();
        self.postMessage({ type: 'done', reason: 'finished', label: lastLabel });
        stopFlag = true;
        return;
      }
    }
    flushCommands();
    if (lastLabel) {
      self.postMessage({ type: 'status', phase: started ? 'RUN' : 'INIT', label: lastLabel });
    }
  } catch (e) {
    flushCommands();
    self.postMessage({
      type: 'error',
      message: e.message || String(e),
      label: lastLabel,
    });
    stopFlag = true;
  }
}

function flushCommands() {
  self.postMessage({ type: 'commands', commands: commandBuffer });
}

function zeroCommands() {
  for (const id of Object.keys(commandBuffer)) {
    const c = commandBuffer[id];
    if (!c) continue;
    if (c.type === 'motor') {
      commandBuffer[id] = { ...c, power: 0, velocityTicksPerSec: 0, velocityMode: false };
    } else if (c.type === 'crServo') {
      commandBuffer[id] = { ...c, power: 0 };
    }
  }
}

function pub(cmd) {
  commandBuffer[cmd.jsId] = cmd;
}

function sensor(jsId) {
  return (
    sensorState[jsId] || { positionTicks: 0, velocityTicksPerSec: 0, busy: false }
  );
}

function createMotorPseudo(interp, _global, jsId) {
  const state = {
    power: 0,
    direction: 'FORWARD',
    mode: 'RUN_WITHOUT_ENCODER',
    zpb: 'BRAKE',
    target: 0,
    tol: 10,
    vel: 0,
    velocityMode: false,
    enabled: true,
    encOff: 0,
  };
  const obj = interp.nativeToPseudo({});
  const dirSign = () => (state.direction === 'REVERSE' ? -1 : 1);
  const emit = () => {
    pub({
      type: 'motor',
      jsId,
      power: state.enabled ? state.power * dirSign() : 0,
      mode: state.mode,
      zeroPowerBehavior: state.zpb,
      targetPosition: state.target,
      targetTolerance: state.tol,
      velocityTicksPerSec: state.vel * dirSign(),
      velocityMode: state.velocityMode,
      enabled: state.enabled,
      encoderOffsetTicks: state.encOff,
    });
  };

  const setNative = (name, fn) => {
    interp.setProperty(obj, name, interp.createNativeFunction(fn));
  };

  setNative('setPower', (p) => {
    state.power = clamp(Number(p), -1, 1);
    state.velocityMode = false;
    emit();
  });
  setNative('getPower', () => state.power);
  setNative('setDirection', (d) => {
    state.direction = String(d);
    emit();
  });
  setNative('getDirection', () => state.direction);
  setNative('setZeroPowerBehavior', (z) => {
    state.zpb = String(z);
    emit();
  });
  setNative('getZeroPowerBehavior', () => state.zpb);
  setNative('setMode', (mode) => {
    const m = String(mode);
    if (m === 'STOP_AND_RESET_ENCODER') {
      state.encOff = sensor(jsId).positionTicks;
      state.power = 0;
      state.mode = 'RUN_WITHOUT_ENCODER';
      emit();
      return;
    }
    state.mode = m;
    emit();
  });
  setNative('getMode', () => state.mode);
  setNative('setTargetPosition', (t) => {
    state.target = Math.round(Number(t));
    emit();
  });
  setNative('getTargetPosition', () => state.target);
  setNative('setTargetPositionTolerance', (t) => {
    state.tol = Number(t);
    emit();
  });
  setNative('getTargetPositionTolerance', () => state.tol);
  setNative('getCurrentPosition', () =>
    Math.round((sensor(jsId).positionTicks - state.encOff) * dirSign()),
  );
  setNative('setVelocity', (v) => {
    state.vel = Number(v);
    state.velocityMode = true;
    emit();
  });
  setNative('getVelocity', () => sensor(jsId).velocityTicksPerSec * dirSign());
  setNative('isBusy', () => !!sensor(jsId).busy);
  setNative('setMotorEnable', () => {
    state.enabled = true;
    emit();
  });
  setNative('setMotorDisable', () => {
    state.enabled = false;
    emit();
  });
  setNative('isMotorEnabled', () => state.enabled);
  setNative('getMaxSpeed', () => 0);
  setNative('setMaxSpeed', () => {});
  setNative('getPowerFloat', () => state.zpb === 'FLOAT');

  // Dual helpers — other motor is a pseudo object; we call its methods via interpreter
  setNative('setDualPower', function (p1, other, p2) {
    state.power = clamp(Number(p1), -1, 1);
    state.velocityMode = false;
    emit();
    callOtherSet(interp, other, 'setPower', p2);
  });
  setNative('setDualMode', function (m1, other, m2) {
    // reuse setMode path
    const sm = obj.properties.setMode;
    interp.setProperty; // keep lint calm
    // direct:
    const modeSetter = (mode) => {
      const m = String(mode);
      if (m === 'STOP_AND_RESET_ENCODER') {
        state.encOff = sensor(jsId).positionTicks;
        state.power = 0;
        state.mode = 'RUN_WITHOUT_ENCODER';
      } else state.mode = m;
      emit();
    };
    modeSetter(m1);
    callOtherSet(interp, other, 'setMode', m2);
  });
  setNative('setDualTargetPosition', (t1, other, t2) => {
    state.target = Math.round(Number(t1));
    emit();
    callOtherSet(interp, other, 'setTargetPosition', t2);
  });
  setNative('setDualZeroPowerBehavior', (z1, other, z2) => {
    state.zpb = String(z1);
    emit();
    callOtherSet(interp, other, 'setZeroPowerBehavior', z2);
  });
  setNative('setDualDirection', (d1, other, d2) => {
    state.direction = String(d1);
    emit();
    callOtherSet(interp, other, 'setDirection', d2);
  });
  setNative('setDualVelocity', (v1, other, v2) => {
    state.vel = Number(v1);
    state.velocityMode = true;
    emit();
    callOtherSet(interp, other, 'setVelocity', v2);
  });

  const unsupported = [
    'setPIDFCoefficients',
    'getPIDFCoefficients',
    'setVelocityPIDFCoefficients',
    'setPositionPIDFCoefficients',
    'getCurrent',
    'setCurrentAlert',
    'getCurrentAlert',
    'isOverCurrent',
  ];
  for (const u of unsupported) {
    setNative(u, () => {
      throw new Error(`Niet ondersteund in simulator: ${jsId}.${u}()`);
    });
  }

  interp.setProperty(obj, '_jsId', jsId);
  motorApiById.set(jsId, {
    setPower: (p) => {
      state.power = clamp(Number(p), -1, 1);
      state.velocityMode = false;
      emit();
    },
    setMode: (mode) => {
      const m = String(mode);
      if (m === 'STOP_AND_RESET_ENCODER') {
        state.encOff = sensor(jsId).positionTicks;
        state.power = 0;
        state.mode = 'RUN_WITHOUT_ENCODER';
      } else state.mode = m;
      emit();
    },
    setTargetPosition: (t) => {
      state.target = Math.round(Number(t));
      emit();
    },
    setZeroPowerBehavior: (z) => {
      state.zpb = String(z);
      emit();
    },
    setDirection: (d) => {
      state.direction = String(d);
      emit();
    },
    setVelocity: (v) => {
      state.vel = Number(v);
      state.velocityMode = true;
      emit();
    },
  });

  emit();
  return obj;
}

function readPseudoJsId(otherPseudo) {
  if (!otherPseudo || !otherPseudo.properties) return null;
  const p = otherPseudo.properties._jsId;
  if (p == null) return null;
  if (typeof p === 'string') return p;
  if (typeof p.data === 'string') return p.data;
  if (p.a && typeof p.a[0] === 'string') return p.a[0]; // some builds
  return null;
}

function callOtherSet(_interp, otherPseudo, method, value) {
  const id = readPseudoJsId(otherPseudo);
  if (!id) return;
  const api = motorApiById.get(id);
  if (!api || typeof api[method] !== 'function') return;
  api[method](value);
}

function createServoPseudo(interp, jsId) {
  const state = { position: 0.5, direction: 'FORWARD', min: 0, max: 1, pwm: true };
  const obj = interp.nativeToPseudo({});
  const emit = () => {
    let p = state.direction === 'REVERSE' ? 1 - state.position : state.position;
    p = state.min + p * (state.max - state.min);
    pub({ type: 'servo', jsId, position01: clamp(p, 0, 1), pwm: state.pwm });
  };
  const setNative = (n, fn) => interp.setProperty(obj, n, interp.createNativeFunction(fn));
  setNative('setPosition', (p) => {
    state.position = clamp(Number(p), 0, 1);
    emit();
  });
  setNative('getPosition', () => state.position);
  setNative('setDirection', (d) => {
    state.direction = String(d);
    emit();
  });
  setNative('getDirection', () => state.direction);
  setNative('scaleRange', (a, b) => {
    state.min = Number(a);
    state.max = Number(b);
    emit();
  });
  setNative('setPwmEnable', () => {
    state.pwm = true;
    emit();
  });
  setNative('setPwmDisable', () => {
    state.pwm = false;
    emit();
  });
  setNative('isPwmEnabled', () => state.pwm);
  emit();
  return obj;
}

function createCrServoPseudo(interp, jsId) {
  const state = { power: 0, direction: 'FORWARD', pwm: true };
  const obj = interp.nativeToPseudo({});
  const emit = () => {
    const s = state.direction === 'REVERSE' ? -1 : 1;
    pub({ type: 'crServo', jsId, power: state.pwm ? state.power * s : 0, pwm: state.pwm });
  };
  const setNative = (n, fn) => interp.setProperty(obj, n, interp.createNativeFunction(fn));
  setNative('setPower', (p) => {
    state.power = clamp(Number(p), -1, 1);
    emit();
  });
  setNative('getPower', () => state.power);
  setNative('setDirection', (d) => {
    state.direction = String(d);
    emit();
  });
  setNative('getDirection', () => state.direction);
  setNative('setPwmEnable', () => {
    state.pwm = true;
    emit();
  });
  setNative('setPwmDisable', () => {
    state.pwm = false;
    emit();
  });
  setNative('isPwmEnabled', () => state.pwm);
  emit();
  return obj;
}

function createLinearOpModePseudo(interp) {
  const obj = interp.nativeToPseudo({});
  const setAsync = (name, impl) => {
    interp.setProperty(obj, name, interp.createAsyncFunction(impl));
  };
  const setNative = (n, fn) => interp.setProperty(obj, n, interp.createNativeFunction(fn));

  setAsync('waitForStart', (callback) => {
    if (stopRequested) {
      callback();
      return;
    }
    if (started) {
      callback();
      return;
    }
    pendingAsync = { kind: 'waitForStart', resume: callback };
    self.postMessage({ type: 'status', phase: 'WAIT_FOR_START' });
  });

  setAsync('sleep', (millis, callback) => {
    if (stopRequested) {
      callback();
      return;
    }
    const until = simTimeSec + Number(millis) / 1000;
    pendingAsync = { kind: 'sleep', until, resume: callback };
  });

  setAsync('idle', (callback) => {
    if (stopRequested) {
      callback();
      return;
    }
    pendingAsync = { kind: 'sleep', until: simTimeSec + 0.001, resume: callback };
  });

  setNative('opModeIsActive', () => started && !stopRequested);
  setNative('opModeInInit', () => !started && !stopRequested);
  setNative('isStarted', () => started);
  setNative('isStopRequested', () => stopRequested);
  setNative('getRuntime', () => simTimeSec);
  setNative('resetRuntime', () => {});
  setNative('requestOpModeStop', () => {
    stopRequested = true;
    stopFlag = true;
  });
  setNative('terminateOpModeNow', () => {
    stopRequested = true;
    stopFlag = true;
    throw new Error('terminateOpModeNow');
  });
  return obj;
}

function createTelemetryPseudo(interp) {
  const obj = interp.nativeToPseudo({});
  const setNative = (n, fn) => interp.setProperty(obj, n, interp.createNativeFunction(fn));
  setNative('addNumericData', (k, n) => {
    self.postMessage({ type: 'telemetryAdd', key: String(k), value: Number(n) });
  });
  setNative('addData', (k, v) => {
    self.postMessage({ type: 'telemetryAdd', key: String(k), value: v });
  });
  setNative('addLine', (t) => {
    self.postMessage({ type: 'telemetryAdd', key: '', value: String(t), line: true });
  });
  setNative('update', () => {
    self.postMessage({ type: 'telemetryUpdate' });
  });
  setNative('clear', () => {
    self.postMessage({ type: 'telemetryClear' });
  });
  setNative('speak', () => {
    throw new Error('Telemetry.speak wordt niet ondersteund in de MuJoCo-simulator.');
  });
  setNative('setDisplayFormat', () => {});
  setNative('setNumDecimalPlaces', () => {});
  setNative('setMsTransmissionInterval', () => {});
  setNative('getMsTransmissionInterval', () => 100);
  setNative('getNumDecimalPlaces', () => 3);
  return obj;
}

function createGamepadPseudo(interp, which) {
  const obj = interp.nativeToPseudo({});
  const read = (prop) => {
    const g = gamepadState[which] || {};
    if (prop in g) return g[prop];
    if (String(prop).endsWith('WasPressed') || String(prop).endsWith('WasReleased')) return false;
    return typeof g[prop] === 'boolean' ? false : 0;
  };
  const props = [
    'LeftStickX', 'LeftStickY', 'RightStickX', 'RightStickY',
    'LeftTrigger', 'RightTrigger',
    'A', 'B', 'X', 'Y', 'LeftBumper', 'RightBumper',
    'DpadUp', 'DpadDown', 'DpadLeft', 'DpadRight',
    'Back', 'Start', 'AtRest',
  ];
  for (const p of props) {
    interp.setProperty(
      obj,
      `get${p}`,
      interp.createNativeFunction(() => read(p)),
    );
  }
  return obj;
}

function createVoltagePseudo(interp) {
  const obj = interp.nativeToPseudo({});
  interp.setProperty(
    obj,
    'getVoltage',
    interp.createNativeFunction(() => supplyVoltage),
  );
  return obj;
}

function createServoControllerPseudo(interp) {
  let pwm = true;
  const obj = interp.nativeToPseudo({});
  interp.setProperty(obj, 'pwmEnable', interp.createNativeFunction(() => { pwm = true; }));
  interp.setProperty(obj, 'pwmDisable', interp.createNativeFunction(() => { pwm = false; }));
  interp.setProperty(obj, 'getPwmStatus', interp.createNativeFunction(() => (pwm ? 'ENABLED' : 'DISABLED')));
  return obj;
}

function createRevModulePseudo(interp) {
  const obj = interp.nativeToPseudo({});
  interp.setProperty(obj, 'setBulkCachingMode', interp.createNativeFunction(() => {}));
  interp.setProperty(obj, 'getBulkCachingMode', interp.createNativeFunction(() => 'OFF'));
  interp.setProperty(obj, 'clearBulkCache', interp.createNativeFunction(() => {}));
  interp.setProperty(obj, 'getDeviceName', interp.createNativeFunction(() => 'Control Hub (gesimuleerd)'));
  return obj;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}


/** --- Simulated IMU / Vision bridges (inlined; classic worker, no ES imports) --- */

function nullOrJson(jsonString) {
  if (jsonString == null || jsonString === '') return null;
  return JSON.parse(String(jsonString));
}

function evalIfTruthy(o, code, defaultValue) {
  if (!o) return defaultValue;
  // Native eval — aprilTagAccess etc. hang on globalThis below.
  return (0, eval)(String(code));
}

function isAngleRadians(angleUnit) {
  const u = String(angleUnit || 'DEGREES').toUpperCase();
  return u === 'RADIANS' || u === 'RADIAN';
}

function createImuPseudo(interp) {
  let yawOffsetRad = 0;
  const raw = () =>
    sensorState.imuAsIMU || {
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      wx: 0,
      wy: 0,
      wz: 0,
    };
  const yawRad = () => raw().yawRad - yawOffsetRad;
  const RAD2DEG = 180 / Math.PI;

  const obj = interp.nativeToPseudo({});
  const setNative = (n, fn) => interp.setProperty(obj, n, interp.createNativeFunction(fn));

  setNative('initialize', () => true);
  setNative('getRobotYawPitchRollAngles', () => {
    const r = raw();
    return interp.nativeToPseudo({
      __type: 'YawPitchRollAngles',
      yawRad: yawRad(),
      pitchRad: r.pitchRad,
      rollRad: r.rollRad,
      yaw: yawRad() * RAD2DEG,
      pitch: r.pitchRad * RAD2DEG,
      roll: r.rollRad * RAD2DEG,
    });
  });
  setNative('getRobotOrientation', (_a, _b, angleUnit) => {
    const r = raw();
    const k = isAngleRadians(angleUnit) ? 1 : RAD2DEG;
    return interp.nativeToPseudo({
      __type: 'Orientation',
      firstAngle: yawRad() * k,
      secondAngle: r.pitchRad * k,
      thirdAngle: r.rollRad * k,
      yaw: yawRad() * k,
      pitch: r.pitchRad * k,
      roll: r.rollRad * k,
      heading: yawRad() * k,
    });
  });
  setNative('getRobotAngularVelocity', (angleUnit) => {
    const r = raw();
    const k = isAngleRadians(angleUnit) ? 1 : RAD2DEG;
    return interp.nativeToPseudo({
      __type: 'AngularVelocity',
      x: (r.wx || 0) * k,
      y: (r.wy || 0) * k,
      z: (r.wz || 0) * k,
      xRotationRate: (r.wx || 0) * k,
      yRotationRate: (r.wy || 0) * k,
      zRotationRate: (r.wz || 0) * k,
    });
  });
  setNative('getRobotOrientationAsQuaternion', () => {
    const y = yawRad();
    const r = raw();
    const p = r.pitchRad;
    const rr = r.rollRad;
    const cy = Math.cos(y * 0.5);
    const sy = Math.sin(y * 0.5);
    const cp = Math.cos(p * 0.5);
    const sp = Math.sin(p * 0.5);
    const cr = Math.cos(rr * 0.5);
    const sr = Math.sin(rr * 0.5);
    return interp.nativeToPseudo({
      w: cr * cp * cy + sr * sp * sy,
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy,
    });
  });
  setNative('resetYaw', () => {
    yawOffsetRad = raw().yawRad;
  });
  return obj;
}

function createYawPitchRollAccessPseudo(interp) {
  const RAD2DEG = 180 / Math.PI;
  const obj = interp.nativeToPseudo({});
  const readRad = (o, keyRad, keyDeg) => {
    const n = interp.pseudoToNative(o) || {};
    if (typeof n[keyRad] === 'number') return n[keyRad];
    if (typeof n[keyDeg] === 'number') return n[keyDeg] / RAD2DEG;
    return 0;
  };
  const get = (o, keyRad, keyDeg, angleUnit) => {
    const rad = readRad(o, keyRad, keyDeg);
    return isAngleRadians(angleUnit) ? rad : rad * RAD2DEG;
  };
  const setNative = (n, fn) => interp.setProperty(obj, n, interp.createNativeFunction(fn));
  setNative('getYaw', (o, u) => get(o, 'yawRad', 'yaw', u || 'DEGREES'));
  setNative('getPitch', (o, u) => get(o, 'pitchRad', 'pitch', u || 'DEGREES'));
  setNative('getRoll', (o, u) => get(o, 'rollRad', 'roll', u || 'DEGREES'));
  return obj;
}

function createAprilTagAccessNative() {
  let lastFreshGen = -1;
  const parseMaybe = (arg) => {
    if (arg == null) return null;
    if (typeof arg === 'string') {
      try {
        return JSON.parse(arg);
      } catch {
        return arg;
      }
    }
    return arg;
  };
  const emptyLib = () => ({ __type: 'AprilTagLibrary', tags: [] });
  return {
    easyCreateWithDefaults() {
      return { __type: 'AprilTagProcessor', decimation: 3 };
    },
    createAprilTagProcessorBuilder() {
      return { __type: 'AprilTagProcessor.Builder', _cfg: {} };
    },
    setDrawAxes(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), drawAxes: v };
    },
    setDrawCubeProjection(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), drawCube: v };
    },
    setDrawTagOutline(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), drawOutline: v };
    },
    setDrawTagID(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), drawId: v };
    },
    setCameraPose() {},
    setLensIntrinsics() {},
    setSuppressCalibrationWarnings(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), suppress: v };
    },
    setNumThreads(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), threads: v };
    },
    setOutputUnits() {},
    setTagFamily(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), family: v };
    },
    setTagLibrary(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), library: v };
    },
    buildAprilTagProcessor(b) {
      return { __type: 'AprilTagProcessor', decimation: 3, ...((b && b._cfg) || {}) };
    },
    setDecimation(p, d) {
      if (p) p.decimation = d;
    },
    setPoseSolver(p, s) {
      if (p) p.poseSolver = s;
    },
    getPerTagAvgPoseSolveTime() {
      return 0;
    },
    getDetections() {
      const snap = sensorState.aprilTagDetections || { json: '[]' };
      return typeof snap.json === 'string' ? snap.json : JSON.stringify(snap.json || []);
    },
    getFreshDetections() {
      const snap = sensorState.aprilTagDetections || { json: '[]', generation: 0 };
      const gen = snap.generation ?? 0;
      const json = typeof snap.json === 'string' ? snap.json : JSON.stringify(snap.json || []);
      if (gen === lastFreshGen) return null;
      lastFreshGen = gen;
      return json;
    },
    createAprilTagPoseFtc(_m, _t, _p, jsonArg) {
      return (
        parseMaybe(jsonArg) || {
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          roll: 0,
          range: 0,
          bearing: 0,
          elevation: 0,
        }
      );
    },
    createAprilTagPoseRaw(_m, _t, _p, jsonArg) {
      return parseMaybe(jsonArg) || { x: 0, y: 0, z: 0 };
    },
    createAprilTagPoseRobot(_m, _t, _p, jsonArg) {
      return (
        parseMaybe(jsonArg) || {
          position: { x: 0, y: 0, z: 0 },
          orientation: { pitch: 0, roll: 0, yaw: 0 },
        }
      );
    },
    createMatrixF(_m, _t, _p, jsonArg) {
      return parseMaybe(jsonArg) || [];
    },
    createQuaternion(_m, _t, _p, jsonArg) {
      return parseMaybe(jsonArg) || { w: 1, x: 0, y: 0, z: 0 };
    },
    createVectorF(_m, _t, _p, jsonArg) {
      return parseMaybe(jsonArg) || [];
    },
    createMetadata() {
      return { __type: 'AprilTagMetadata', id: -1 };
    },
    createMetadata_withoutPoseInfo() {
      return { __type: 'AprilTagMetadata', id: -1 };
    },
    getCurrentGameTagLibrary: emptyLib,
    getCenterStageTagLibrary: emptyLib,
    getIntoTheDeepTagLibrary: emptyLib,
    getDecodeTagLibrary: emptyLib,
    getBioBuzzTagLibrary: emptyLib,
    getSampleTagLibrary: emptyLib,
    createAprilTagLibraryBuilder() {
      return { __type: 'AprilTagLibrary.Builder', tags: [] };
    },
    setAllowOverwrite() {},
    addTag() {},
    addTag_WithMetadata() {},
    addTag_withoutPoseInfo() {},
    addTags() {},
    buildAprilTagLibrary(b) {
      return { __type: 'AprilTagLibrary', tags: (b && b.tags) || [] };
    },
    lookupTag() {
      return null;
    },
  };
}


const DEFAULT_EXPOSURE_NS = 10e6;

function cameraUnitName(unit) {
  if (unit == null) return 'NANOSECONDS';
  if (typeof unit === 'string') return unit.toUpperCase();
  if (typeof unit === 'object') {
    if (typeof unit.name === 'string') return unit.name.toUpperCase();
    if (typeof unit.toString === 'function') {
      const s = String(unit.toString());
      const m = s.match(/(NANOSECONDS|MILLISECONDS|MICROSECONDS|SECONDS|MINUTES|HOURS|DAYS)/i);
      if (m) return m[1].toUpperCase();
      return s.toUpperCase();
    }
  }
  return String(unit).toUpperCase();
}

function toNanoseconds(duration, unit) {
  const d = Number(duration) || 0;
  switch (cameraUnitName(unit)) {
    case 'NANOSECONDS':
    case 'NANOSECOND':
      return d;
    case 'MICROSECONDS':
    case 'MICROSECOND':
      return d * 1e3;
    case 'MILLISECONDS':
    case 'MILLISECOND':
      return d * 1e6;
    case 'SECONDS':
    case 'SECOND':
      return d * 1e9;
    case 'MINUTES':
    case 'MINUTE':
      return d * 60e9;
    case 'HOURS':
    case 'HOUR':
      return d * 3600e9;
    case 'DAYS':
    case 'DAY':
      return d * 86400e9;
    default:
      return d;
  }
}

function fromNanoseconds(ns, unit) {
  const n = Number(ns) || 0;
  switch (cameraUnitName(unit)) {
    case 'NANOSECONDS':
    case 'NANOSECOND':
      return n;
    case 'MICROSECONDS':
    case 'MICROSECOND':
      return n / 1e3;
    case 'MILLISECONDS':
    case 'MILLISECOND':
      return n / 1e6;
    case 'SECONDS':
    case 'SECOND':
      return n / 1e9;
    case 'MINUTES':
    case 'MINUTE':
      return n / 60e9;
    case 'HOURS':
    case 'HOUR':
      return n / 3600e9;
    case 'DAYS':
    case 'DAY':
      return n / 86400e9;
    default:
      return n;
  }
}

function createExposureControlNative() {
  return {
    __type: 'ExposureControl',
    mode: 'ContinuousAuto',
    exposureNs: DEFAULT_EXPOSURE_NS,
    minExposureNs: 1e3,
    maxExposureNs: 100e6,
    aePriority: true,
  };
}

function createGainControlNative() {
  return { __type: 'GainControl', gain: 0, minGain: 0, maxGain: 100 };
}

function createFocusControlNative() {
  return {
    __type: 'FocusControl',
    mode: 'ContinuousAuto',
    focusLength: 1.0,
    minFocusLength: 0.1,
    maxFocusLength: 10.0,
  };
}

function createWhiteBalanceControlNative() {
  return {
    __type: 'WhiteBalanceControl',
    mode: 'AUTO',
    temperature: 5500,
    minTemperature: 2000,
    maxTemperature: 10000,
  };
}

function createPtzControlNative() {
  return {
    __type: 'PtzControl',
    pan: 0,
    tilt: 0,
    minPan: -100,
    maxPan: 100,
    minTilt: -100,
    maxTilt: 100,
    zoom: 1,
    minZoom: 1,
    maxZoom: 10,
  };
}

function ensureCtrl(ctrl, factory) {
  return ctrl && typeof ctrl === 'object' ? ctrl : factory();
}

function parsePanTiltHolder(holder) {
  if (holder == null) return { pan: 0, tilt: 0 };
  if (typeof holder === 'string') {
    try {
      const o = JSON.parse(holder);
      return { pan: Number(o.pan) || 0, tilt: Number(o.tilt) || 0 };
    } catch (_) {
      return { pan: 0, tilt: 0 };
    }
  }
  if (typeof holder === 'object') {
    return { pan: Number(holder.pan) || 0, tilt: Number(holder.tilt) || 0 };
  }
  return { pan: 0, tilt: 0 };
}

const exposureControlAccessNative = {
  getMode(ctrl) {
    return ensureCtrl(ctrl, createExposureControlNative).mode;
  },
  setMode(ctrl, mode) {
    const c = ensureCtrl(ctrl, createExposureControlNative);
    c.mode = mode != null ? String(mode) : c.mode;
    return true;
  },
  isModeSupported() {
    return true;
  },
  getExposure(ctrl, unit) {
    return fromNanoseconds(ensureCtrl(ctrl, createExposureControlNative).exposureNs, unit);
  },
  getMinExposure(ctrl, unit) {
    return fromNanoseconds(ensureCtrl(ctrl, createExposureControlNative).minExposureNs, unit);
  },
  getMaxExposure(ctrl, unit) {
    return fromNanoseconds(ensureCtrl(ctrl, createExposureControlNative).maxExposureNs, unit);
  },
  setExposure(ctrl, duration, unit) {
    const c = ensureCtrl(ctrl, createExposureControlNative);
    c.exposureNs = toNanoseconds(duration, unit);
    return true;
  },
  isExposureSupported() {
    return true;
  },
  getAePriority(ctrl) {
    return !!ensureCtrl(ctrl, createExposureControlNative).aePriority;
  },
  setAePriority(ctrl, priority) {
    const c = ensureCtrl(ctrl, createExposureControlNative);
    c.aePriority = !!priority;
    return true;
  },
};

const gainControlAccessNative = {
  getGain(ctrl) {
    return ensureCtrl(ctrl, createGainControlNative).gain;
  },
  getMinGain(ctrl) {
    return ensureCtrl(ctrl, createGainControlNative).minGain;
  },
  getMaxGain(ctrl) {
    return ensureCtrl(ctrl, createGainControlNative).maxGain;
  },
  setGain(ctrl, gain) {
    const c = ensureCtrl(ctrl, createGainControlNative);
    c.gain = Number(gain) || 0;
    return true;
  },
};

const focusControlAccessNative = {
  getMode(ctrl) {
    return ensureCtrl(ctrl, createFocusControlNative).mode;
  },
  setMode(ctrl, mode) {
    const c = ensureCtrl(ctrl, createFocusControlNative);
    c.mode = mode != null ? String(mode) : c.mode;
    return true;
  },
  isModeSupported() {
    return true;
  },
  getFocusLength(ctrl) {
    return ensureCtrl(ctrl, createFocusControlNative).focusLength;
  },
  getMinFocusLength(ctrl) {
    return ensureCtrl(ctrl, createFocusControlNative).minFocusLength;
  },
  getMaxFocusLength(ctrl) {
    return ensureCtrl(ctrl, createFocusControlNative).maxFocusLength;
  },
  setFocusLength(ctrl, length) {
    const c = ensureCtrl(ctrl, createFocusControlNative);
    c.focusLength = Number(length);
    return true;
  },
  isFocusLengthSupported() {
    return true;
  },
};

const whiteBalanceControlAccessNative = {
  getMode(ctrl) {
    return ensureCtrl(ctrl, createWhiteBalanceControlNative).mode;
  },
  setMode(ctrl, mode) {
    const c = ensureCtrl(ctrl, createWhiteBalanceControlNative);
    c.mode = mode != null ? String(mode) : c.mode;
    return true;
  },
  getWhiteBalanceTemperature(ctrl) {
    return ensureCtrl(ctrl, createWhiteBalanceControlNative).temperature;
  },
  getMinWhiteBalanceTemperature(ctrl) {
    return ensureCtrl(ctrl, createWhiteBalanceControlNative).minTemperature;
  },
  getMaxWhiteBalanceTemperature(ctrl) {
    return ensureCtrl(ctrl, createWhiteBalanceControlNative).maxTemperature;
  },
  setWhiteBalanceTemperature(ctrl, kelvin) {
    const c = ensureCtrl(ctrl, createWhiteBalanceControlNative);
    c.temperature = Number(kelvin) || 0;
    return true;
  },
};

const ptzControlAccessNative = {
  getPanTilt(ctrl) {
    const c = ensureCtrl(ctrl, createPtzControlNative);
    return JSON.stringify({ pan: c.pan, tilt: c.tilt });
  },
  getMinPanTilt(ctrl) {
    const c = ensureCtrl(ctrl, createPtzControlNative);
    return JSON.stringify({ pan: c.minPan, tilt: c.minTilt });
  },
  getMaxPanTilt(ctrl) {
    const c = ensureCtrl(ctrl, createPtzControlNative);
    return JSON.stringify({ pan: c.maxPan, tilt: c.maxTilt });
  },
  setPanTilt(ctrl, holder) {
    const c = ensureCtrl(ctrl, createPtzControlNative);
    const pt = parsePanTiltHolder(holder);
    c.pan = pt.pan;
    c.tilt = pt.tilt;
    return true;
  },
  getZoom(ctrl) {
    return ensureCtrl(ctrl, createPtzControlNative).zoom;
  },
  getMinZoom(ctrl) {
    return ensureCtrl(ctrl, createPtzControlNative).minZoom;
  },
  getMaxZoom(ctrl) {
    return ensureCtrl(ctrl, createPtzControlNative).maxZoom;
  },
  setZoom(ctrl, zoom) {
    const c = ensureCtrl(ctrl, createPtzControlNative);
    c.zoom = Number(zoom) || 0;
    return true;
  },
};

function createVisionPortalAccessNative() {
  const state = new WeakMap();
  const controlCache = new WeakMap();
  const st = (p) => {
    if (!p || typeof p !== 'object') return { streaming: true };
    if (!state.has(p)) state.set(p, { streaming: true });
    return state.get(p);
  };
  const ensurePortalControls = (portal) => {
    const key = portal && typeof portal === 'object' ? portal : null;
    if (!key) {
      return {
        exposure: createExposureControlNative(),
        focus: createFocusControlNative(),
        gain: createGainControlNative(),
        ptz: createPtzControlNative(),
        whiteBalance: createWhiteBalanceControlNative(),
      };
    }
    if (!controlCache.has(key)) {
      controlCache.set(key, {
        exposure: createExposureControlNative(),
        focus: createFocusControlNative(),
        gain: createGainControlNative(),
        ptz: createPtzControlNative(),
        whiteBalance: createWhiteBalanceControlNative(),
      });
    }
    return controlCache.get(key);
  };
  const unsupported = (name) => {
    throw new Error(
      'Niet ondersteund in MuJoCo-simulator (simulated VisionPortal): visionPortalAccess.' +
        name +
        '()',
    );
  };
  return {
    easyCreateWithDefaults_oneProcessor(camera, processor) {
      return { __type: 'VisionPortal', camera, processors: processor ? [processor] : [] };
    },
    easyCreateWithDefaults_twoProcessors(camera, p1, p2) {
      return { __type: 'VisionPortal', camera, processors: [p1, p2].filter(Boolean) };
    },
    createBuilder() {
      return { __type: 'VisionPortal.Builder', _cfg: { processors: [] } };
    },
    setCamera(b, camera) {
      if (b) b._cfg = { ...(b._cfg || {}), camera };
    },
    setStreamFormat(b, fmt) {
      if (b) b._cfg = { ...(b._cfg || {}), streamFormat: fmt };
    },
    enableLiveView(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), liveView: v };
    },
    setAutoStopLiveView(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), autoStop: v };
    },
    setAutoStartStreamOnBuild(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), autoStart: v };
    },
    setShowStatsOverlay(b, v) {
      if (b) b._cfg = { ...(b._cfg || {}), stats: v };
    },
    setLiveViewContainerId(b, id) {
      if (b) b._cfg = { ...(b._cfg || {}), containerId: id };
    },
    setCameraResolution() {},
    addProcessor(b, processor) {
      if (b) {
        const procs = [...((b._cfg && b._cfg.processors) || []), processor];
        b._cfg = { ...(b._cfg || {}), processors: procs };
      }
    },
    build(b) {
      const cfg = (b && b._cfg) || {};
      return { __type: 'VisionPortal', camera: cfg.camera, processors: cfg.processors || [] };
    },
    getCameraState(p) {
      return st(p).streaming ? 'STREAMING' : 'CAMERA_DEVICE_CLOSED';
    },
    stopStreaming(p) {
      st(p).streaming = false;
    },
    resumeStreaming(p) {
      st(p).streaming = true;
    },
    stopLiveView() {},
    resumeLiveView() {},
    getFps() {
      return 30;
    },
    setProcessorEnabled(_p, processor, enabled) {
      if (processor) processor.enabled = !!enabled;
    },
    getProcessorEnabled(_p, processor) {
      return processor ? processor.enabled !== false : false;
    },
    close(p) {
      st(p).streaming = false;
    },
    saveNextFrameRaw() {
      unsupported('saveNextFrameRaw');
    },
    getExposureControl(portal) {
      return ensurePortalControls(portal).exposure;
    },
    getFocusControl(portal) {
      return ensurePortalControls(portal).focus;
    },
    getGainControl(portal) {
      return ensurePortalControls(portal).gain;
    },
    getPtzControl(portal) {
      return ensurePortalControls(portal).ptz;
    },
    getWhiteBalanceControl(portal) {
      return ensurePortalControls(portal).whiteBalance;
    },
    setActiveCamera() {
      unsupported('setActiveCamera');
    },
    getActiveCamera(p) {
      return p && p.camera;
    },
    cameraStreamServer_setSource() {},
    makeMultiPortalView() {
      return [];
    },
    cameraCompatibilityManager_addQuirk() {},
    cameraCompatibilityManager_removeQuirk() {},
    cameraCompatibilityManager_getQuirks() {
      return [];
    },
  };
}

function createMiscAccessNative() {
  return {
    formatNumber(n, precision) {
      return Number(n).toFixed(Number(precision) || 0);
    },
    formatNumber_withWidth(n, width, precision) {
      const formatted = Number(n).toFixed(Number(precision) || 0);
      return formatted.padStart(Math.max(0, Number(width) || 0), ' ');
    },
    roundDecimal(n, precision) {
      const p = 10 ** (Number(precision) || 0);
      return Math.round(Number(n) * p) / p;
    },
    min(a, b) {
      return Math.min(a, b);
    },
    max(a, b) {
      return Math.max(a, b);
    },
  };
}

function wrapNativeAccess(interp, native) {
  const obj = interp.nativeToPseudo({});
  for (const key of Object.keys(native)) {
    const fn = native[key];
    if (typeof fn !== 'function') {
      interp.setProperty(obj, key, fn);
      continue;
    }
    interp.setProperty(
      obj,
      key,
      interp.createNativeFunction(function () {
        const args = [];
        for (let i = 0; i < arguments.length; i++) {
          try {
            args.push(interp.pseudoToNative(arguments[i]));
          } catch (_) {
            args.push(arguments[i]);
          }
        }
        const result = fn.apply(native, args);
        if (result === null || result === undefined) return result;
        if (typeof result !== 'object') return result;
        return interp.nativeToPseudo(result);
      }),
    );
  }
  return obj;
}

function bindSimulatedSensors(interp, globalObject) {
  const aprilNative = createAprilTagAccessNative();
  const visionNative = createVisionPortalAccessNative();
  const navNative = {
    getWebcamName(name) {
      return { __type: 'WebcamName', name: String(name) };
    },
  };
  const paramsNative = {
    create(orientation) {
      return { __type: 'IMU.Parameters', imuOrientationOnRobot: orientation };
    },
  };
  const revNative = {
    create1(logo, usb) {
      return {
        __type: 'RevHubOrientationOnRobot',
        logoFacingDirection: logo,
        usbFacingDirection: usb,
      };
    },
    create2(logo, usb) {
      return revNative.create1(logo, usb);
    },
    create3(a, b, c) {
      return { __type: 'RevHubOrientationOnRobot', zyx: [a, b, c] };
    },
  };

  // For evalIfTruthy native eval
  self.aprilTagAccess = aprilNative;
  self.visionPortalAccess = visionNative;
  self.exposureControlAccess = exposureControlAccessNative;
  self.gainControlAccess = gainControlAccessNative;
  self.focusControlAccess = focusControlAccessNative;
  self.whiteBalanceControlAccess = whiteBalanceControlAccessNative;
  self.ptzControlAccess = ptzControlAccessNative;
  self.navigationAccess = navNative;
  self.imuParametersAccess = paramsNative;
  self.bno055imuParametersAccess = paramsNative;
  self.revHubOrientationOnRobotAccess = revNative;
  self.yawPitchRollAnglesAccess = {
    getYaw(o, u) {
      const RAD2DEG = 180 / Math.PI;
      const n = o || {};
      const rad = typeof n.yawRad === 'number' ? n.yawRad : (n.yaw || 0) / RAD2DEG;
      return isAngleRadians(u) ? rad : rad * RAD2DEG;
    },
    getPitch(o, u) {
      const RAD2DEG = 180 / Math.PI;
      const n = o || {};
      const rad = typeof n.pitchRad === 'number' ? n.pitchRad : (n.pitch || 0) / RAD2DEG;
      return isAngleRadians(u) ? rad : rad * RAD2DEG;
    },
    getRoll(o, u) {
      const RAD2DEG = 180 / Math.PI;
      const n = o || {};
      const rad = typeof n.rollRad === 'number' ? n.rollRad : (n.roll || 0) / RAD2DEG;
      return isAngleRadians(u) ? rad : rad * RAD2DEG;
    },
  };

  interp.setProperty(globalObject, 'imuAsIMU', createImuPseudo(interp));
  interp.setProperty(globalObject, 'yawPitchRollAnglesAccess', createYawPitchRollAccessPseudo(interp));
  interp.setProperty(globalObject, 'aprilTagAccess', wrapNativeAccess(interp, aprilNative));
  interp.setProperty(globalObject, 'visionPortalAccess', wrapNativeAccess(interp, visionNative));
  interp.setProperty(globalObject, 'exposureControlAccess', wrapNativeAccess(interp, exposureControlAccessNative));
  interp.setProperty(globalObject, 'gainControlAccess', wrapNativeAccess(interp, gainControlAccessNative));
  interp.setProperty(globalObject, 'focusControlAccess', wrapNativeAccess(interp, focusControlAccessNative));
  interp.setProperty(globalObject, 'whiteBalanceControlAccess', wrapNativeAccess(interp, whiteBalanceControlAccessNative));
  interp.setProperty(globalObject, 'ptzControlAccess', wrapNativeAccess(interp, ptzControlAccessNative));
  interp.setProperty(globalObject, 'navigationAccess', wrapNativeAccess(interp, navNative));
  interp.setProperty(globalObject, 'bno055imuParametersAccess', wrapNativeAccess(interp, paramsNative));
  interp.setProperty(globalObject, 'imuParametersAccess', wrapNativeAccess(interp, paramsNative));
  interp.setProperty(globalObject, 'revHubOrientationOnRobotAccess', wrapNativeAccess(interp, revNative));

  interp.setProperty(
    globalObject,
    'nullOrJson',
    interp.createNativeFunction((s) => {
      const v = s && s.isPrimitive ? s.data : s == null ? null : interp.pseudoToNative(s);
      const parsed = nullOrJson(v);
      if (parsed === null || parsed === undefined) return parsed;
      if (typeof parsed !== 'object') return parsed;
      return interp.nativeToPseudo(parsed);
    }),
  );
  interp.setProperty(
    globalObject,
    'evalIfTruthy',
    interp.createNativeFunction((o, code, def) => {
      const truthy = o && (!o.isPrimitive || o.data);
      if (!truthy) return def;
      const codeStr =
        typeof code === 'string'
          ? code
          : code && code.isPrimitive
            ? String(code.data)
            : String(interp.pseudoToNative(code));
      const result = evalIfTruthy(true, codeStr, null);
      if (result === null || result === undefined) return result;
      if (typeof result !== 'object') return result;
      return interp.nativeToPseudo(result);
    }),
  );
}

