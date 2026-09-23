/**
 * Host-controller voor de OpMode-worker.
 * INIT → run tot waitForStart; START hervat; STOP onderbreekt binnen ~250ms en zerot actuatoren.
 */
import { publicUrl } from '../publicUrl.js';

export class OpModeRunner {
  constructor({
    onStatus,
    onTelemetryAdd,
    onTelemetryUpdate,
    onTelemetryClear,
    onCommands,
    onError,
    onDone,
  }) {
    this._hooks = {
      onStatus,
      onTelemetryAdd,
      onTelemetryUpdate,
      onTelemetryClear,
      onCommands,
      onError,
      onDone,
    };
    this._worker = null;
    this._ready = false;
    this._phase = 'Idle';
    this._stopTimer = null;
    this._pendingTelemetry = new Map();
    this._pendingLines = [];
  }

  async ensureWorker() {
    if (this._worker) return;
    this._worker = new Worker(publicUrl('execution/opModeWorker.js'));
    this._worker.onmessage = (ev) => this._onMessage(ev.data);
    this._worker.onerror = (e) => {
      this._hooks.onError?.(e.message || 'Worker-fout');
    };
    await new Promise((resolve, reject) => {
      const acornUrl = publicUrl('vendor/js-interpreter/acorn.js');
      const interpreterUrl = publicUrl('vendor/js-interpreter/interpreter.js');
      const onMsg = (ev) => {
        if (ev.data?.type === 'ready') {
          this._worker.removeEventListener('message', onMsg);
          this._ready = true;
          resolve();
        } else if (ev.data?.type === 'error') {
          reject(new Error(ev.data.message));
        }
      };
      this._worker.addEventListener('message', onMsg);
      this._worker.postMessage({
        type: 'loadInterpreter',
        acornUrl,
        interpreterUrl,
      });
    });
  }

  get phase() {
    return this._phase;
  }

  async init(code, { sensors, supplyVoltage } = {}) {
    await this.ensureWorker();
    this._clearStopTimer();
    this._pendingTelemetry.clear();
    this._pendingLines = [];
    this._phase = 'INIT';
    this._hooks.onStatus?.('INIT');
    this._worker.postMessage({
      type: 'init',
      code,
      sensors: sensors || {},
      supplyVoltage,
    });
  }

  start() {
    this._worker?.postMessage({ type: 'start' });
    this._phase = 'RUN';
    this._hooks.onStatus?.('RUN');
  }

  /**
   * STOP: signaal naar worker + hard zero binnen 250ms.
   */
  stop(zeroFn) {
    const t0 = performance.now();
    this._worker?.postMessage({ type: 'stop' });
    this._phase = 'STOP';
    this._hooks.onStatus?.('STOP');
    zeroFn?.();
    this._clearStopTimer();
    this._stopTimer = setTimeout(() => {
      zeroFn?.();
      const dt = performance.now() - t0;
      this._hooks.onStatus?.(`STOP (${dt.toFixed(0)} ms)`);
    }, 50);
    // Force again at 200ms to meet ~250ms budget even if worker lags
    setTimeout(() => zeroFn?.(), 200);
  }

  pushClock(timeSec, sensors, gamepads) {
    this._worker?.postMessage({
      type: 'clock',
      timeSec,
      sensors,
      gamepads,
    });
  }

  _onMessage(msg) {
    if (!msg) return;
    switch (msg.type) {
      case 'status':
        this._phase = msg.phase || this._phase;
        this._hooks.onStatus?.(msg.phase, msg.label);
        break;
      case 'commands':
        this._hooks.onCommands?.(msg.commands || {});
        break;
      case 'telemetryAdd':
        if (msg.line) this._pendingLines.push(String(msg.value));
        else this._pendingTelemetry.set(String(msg.key), msg.value);
        this._hooks.onTelemetryAdd?.(msg);
        break;
      case 'telemetryUpdate': {
        const lines = [];
        for (const [k, v] of this._pendingTelemetry) {
          lines.push(`${k}: ${v}`);
        }
        lines.push(...this._pendingLines);
        this._pendingTelemetry.clear();
        this._pendingLines = [];
        this._hooks.onTelemetryUpdate?.(lines.join('\n'));
        break;
      }
      case 'telemetryClear':
        this._pendingTelemetry.clear();
        this._pendingLines = [];
        this._hooks.onTelemetryClear?.();
        break;
      case 'error':
        this._phase = 'ERROR';
        this._hooks.onError?.(msg.message, msg.label);
        break;
      case 'done':
        this._phase = 'DONE';
        this._hooks.onDone?.(msg.reason);
        break;
      default:
        break;
    }
  }

  _clearStopTimer() {
    if (this._stopTimer) clearTimeout(this._stopTimer);
    this._stopTimer = null;
  }

  dispose() {
    this._clearStopTimer();
    this._worker?.terminate();
    this._worker = null;
    this._ready = false;
  }
}
