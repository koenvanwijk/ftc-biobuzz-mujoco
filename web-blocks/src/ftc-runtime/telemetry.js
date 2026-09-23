export class Telemetry {
  constructor(onUpdate = () => {}) {
    this._pending = new Map();
    this._lines = [];
    this._display = [];
    this._onUpdate = onUpdate;
    this._msTransmissionInterval = 100;
    this._numDecimalPlaces = 3;
  }

  addNumericData(key, number) {
    this._pending.set(String(key), Number(number));
  }

  addData(key, value) {
    this._pending.set(String(key), value);
  }

  addLine(text) {
    this._lines.push(String(text));
  }

  update() {
    const out = [];
    for (const [k, v] of this._pending) {
      const num = typeof v === 'number' ? v.toFixed(this._numDecimalPlaces) : String(v);
      out.push(`${k}: ${num}`);
    }
    for (const line of this._lines) out.push(line);
    this._display = out;
    this._pending.clear();
    this._lines = [];
    this._onUpdate(this._display.join('\n'));
  }

  clear() {
    this._pending.clear();
    this._lines = [];
    this._display = [];
    this._onUpdate('');
  }

  setMsTransmissionInterval(ms) {
    this._msTransmissionInterval = Number(ms);
  }

  getMsTransmissionInterval() {
    return this._msTransmissionInterval;
  }

  setNumDecimalPlaces(n) {
    this._numDecimalPlaces = Number(n) | 0;
  }

  getNumDecimalPlaces() {
    return this._numDecimalPlaces;
  }

  /** Unsupported speak — luide fout i.p.v. stille no-op. */
  speak() {
    throw new Error('Telemetry.speak wordt niet ondersteund in de MuJoCo-simulator.');
  }

  setDisplayFormat() {
    /* optioneel genegeerd: alleen layout DS */
  }

  getSnapshot() {
    return this._display.slice();
  }
}

export function telemetryAddTextData(telemetry, key, text) {
  telemetry.addData(key, text);
}
