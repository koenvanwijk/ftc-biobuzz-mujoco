/** One source per running motor; collision is a separate, non-looping voice. */
export class RobotAudio {
  constructor(urls, { contextFactory = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), fetcher = (...args) => globalThis.fetch(...args), onError = () => {} } = {}) {
    this.urls = urls;
    this.contextFactory = contextFactory;
    this.fetcher = fetcher;
    this.onError = onError;
    this.buffers = new Map();
    this.voices = new Map();
    this.state = {};
    this.enabled = false;
    this.context = null;
    this.loading = null;
    this.disposed = false;
  }

  /** Call directly inside a click handler, before awaiting anything (browser autoplay). */
  async setEnabled(enabled) {
    this.enabled = !!enabled && !this.disposed;
    if (!this.enabled) { this.stopAll(); return; }
    try {
      this.context ||= this.contextFactory();
      const resumed = this.context.resume();
      this.loading ||= Promise.all(Object.entries(this.urls).map(async ([name, url]) => {
        const response = await this.fetcher(url);
        if (!response.ok) throw new Error(`Audio ${name}: HTTP ${response.status}`);
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(name, buffer);
      })).catch((error) => { this.loading = null; throw error; });
      await Promise.all([resumed, this.loading]);
      this._sync(); // Latest motor state only: a stopped motor must not start after loading.
    } catch (error) {
      this.enabled = false;
      this.stopAll();
      this.onError(error);
    }
  }

  update(state) {
    this.state = { ...state };
    this._sync();
  }

  _sync() {
    for (const name of ['flywheel', 'intake', 'drive']) {
      const wanted = this.enabled && this.state[name] && !this.disposed;
      if (!wanted) this._stop(name);
      else if (this.context?.state === 'running' && this.buffers.has(name) && !this.voices.has(name)) this._play(name, true);
    }
  }

  impact() {
    if (!this.enabled || this.disposed || this.context?.state !== 'running' || !this.buffers.has('collision')) return;
    this._stop('collision'); // Bound concurrency, even during several simultaneous contacts.
    this._play('collision', false);
  }

  _play(name, loop) {
    const source = this.context.createBufferSource();
    source.buffer = this.buffers.get(name);
    source.loop = loop;
    source.connect(this.context.destination);
    source.onended = () => {
      if (this.voices.get(name) === source) this.voices.delete(name);
      source.disconnect();
    };
    this.voices.set(name, source);
    source.start();
  }

  _stop(name) {
    const source = this.voices.get(name);
    if (!source) return;
    this.voices.delete(name);
    source.stop();
    source.disconnect();
  }

  stopAll() {
    this.state = {};
    for (const name of [...this.voices.keys()]) this._stop(name);
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.stopAll();
    this.context?.close();
  }
}
