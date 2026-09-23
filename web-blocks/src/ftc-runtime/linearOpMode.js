/**
 * LinearOpMode-brug. waitForStart / sleep / idle gebruiken de gedeelde SimClock.
 * In de Worker worden sleep/waitForStart als async native bindings geïnjecteerd;
 * deze klasse houdt de semantiek bij voor de host/runtime.
 */
export class LinearOpModeBridge {
  constructor(clock, { onStateChange } = {}) {
    this.clock = clock;
    this._started = false;
    this._stopRequested = false;
    this._inInit = true;
    this._runtimeOffsetSec = 0;
    this._waitingForStart = false;
    this._sleepUntilSec = null;
    this._onStateChange = onStateChange || (() => {});
  }

  resetForInit() {
    this._started = false;
    this._stopRequested = false;
    this._inInit = true;
    this._runtimeOffsetSec = this.clock.timeSec;
    this._waitingForStart = false;
    this._sleepUntilSec = null;
    this._onStateChange(this.getState());
  }

  /** Host: START-knop */
  signalStart() {
    this._started = true;
    this._inInit = false;
    this._waitingForStart = false;
    this._runtimeOffsetSec = this.clock.timeSec;
    this._onStateChange(this.getState());
  }

  /** Host: STOP-knop */
  signalStop() {
    this._stopRequested = true;
    this._waitingForStart = false;
    this._sleepUntilSec = null;
    this._onStateChange(this.getState());
  }

  beginWaitForStart() {
    this._waitingForStart = true;
    this._inInit = true;
    this._onStateChange(this.getState());
  }

  beginSleep(millis) {
    this._sleepUntilSec = this.clock.timeSec + Number(millis) / 1000;
    this._onStateChange(this.getState());
  }

  /** @returns {boolean} true als sleep/wait klaar is */
  pollWaits() {
    if (this._stopRequested) {
      this._waitingForStart = false;
      this._sleepUntilSec = null;
      return true;
    }
    if (this._waitingForStart) {
      return this._started;
    }
    if (this._sleepUntilSec != null) {
      if (this.clock.timeSec >= this._sleepUntilSec) {
        this._sleepUntilSec = null;
        return true;
      }
      return false;
    }
    return true;
  }

  isWaiting() {
    return this._waitingForStart || this._sleepUntilSec != null;
  }

  waitForStart() {
    this.beginWaitForStart();
  }

  sleep(millis) {
    this.beginSleep(millis);
  }

  idle() {
    // korte coöperatieve yield — Host/worker behandelt als mini-sleep van 1 sim-ms
    this.beginSleep(1);
  }

  opModeInInit() {
    return this._inInit && !this._stopRequested;
  }

  opModeIsActive() {
    return this._started && !this._stopRequested;
  }

  isStarted() {
    return this._started;
  }

  isStopRequested() {
    return this._stopRequested;
  }

  getRuntime() {
    return Math.max(0, this.clock.timeSec - this._runtimeOffsetSec);
  }

  resetRuntime() {
    this._runtimeOffsetSec = this.clock.timeSec;
  }

  requestOpModeStop() {
    this.signalStop();
  }

  terminateOpModeNow() {
    this.signalStop();
    throw new Error('terminateOpModeNow');
  }

  getState() {
    return {
      started: this._started,
      stopRequested: this._stopRequested,
      inInit: this._inInit,
      waitingForStart: this._waitingForStart,
      sleepUntilSec: this._sleepUntilSec,
      runtime: this.getRuntime(),
    };
  }
}
