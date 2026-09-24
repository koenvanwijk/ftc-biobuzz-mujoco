/**
 * Eén gedeelde simulatietijdklok voor sleep/idle/timers en physics.
 * Physics en OpMode delen dezelfde tijdbasis (seconden).
 */
export class SimClock {
  constructor() {
    this._timeSec = 0;
    this._running = true;
  }

  get timeSec() {
    return this._timeSec;
  }

  get timeMs() {
    return this._timeSec * 1000;
  }

  advance(dtSec) {
    if (!this._running) return;
    if (dtSec > 0) this._timeSec += dtSec;
  }

  reset() {
    this._timeSec = 0;
  }

  pause() {
    this._running = false;
  }

  resume() {
    this._running = true;
  }
}
