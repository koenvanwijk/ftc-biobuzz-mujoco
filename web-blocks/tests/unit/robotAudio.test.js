import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RobotAudio } from '../../src/audio/RobotAudio.js';
import { RobotImpacts } from '../../src/audio/RobotImpacts.js';
import { BiobuzzHardwareAdapter } from '../../src/mujoco/BiobuzzHardwareAdapter.js';

function fixture(fetcher) {
  const sources = [], errors = [];
  const context = {
    state: 'suspended', destination: {},
    resume() { this.state = 'running'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
    decodeAudioData: async (bytes) => bytes,
    createBufferSource() {
      const s = { starts: 0, stops: 0, connect() {}, disconnect() {}, start() { this.starts++; }, stop() { this.stops++; } };
      sources.push(s); return s;
    },
  };
  const audio = new RobotAudio(Object.fromEntries(['flywheel', 'intake', 'drive', 'collision'].map((x) => [x, x])), {
    contextFactory: () => context,
    fetcher: fetcher || (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
    onError: (e) => errors.push(e),
  });
  return { audio, context, sources, errors };
}

describe('recorded motor audio', () => {
  it('default fetcher calls window.fetch with the right this (no Illegal invocation)', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = function (url) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    };
    try {
      const errors = [];
      const context = { state: 'suspended', destination: {}, resume() { this.state = 'running'; return Promise.resolve(); },
        close() { return Promise.resolve(); }, decodeAudioData: async (b) => b,
        createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; } };
      const audio = new RobotAudio({ drive: 'drive' }, { contextFactory: () => context, onError: (e) => errors.push(e) });
      await audio.setEnabled(true);
      assert.deepEqual(errors, []);
      assert.equal(audio.buffers.size, 1);
    } finally { globalThis.fetch = orig; }
  });

  it('unlocks on a gesture; one independent loop per motor, no duplicates', async () => {
    const { audio, sources } = fixture();
    audio.update({ flywheel: true, intake: true, drive: true });
    assert.equal(sources.length, 0);
    await audio.setEnabled(true);
    assert.equal(sources.length, 3);
    assert.ok(sources.every((s) => s.loop && s.starts === 1));
    for (let i = 0; i < 100; i++) audio.update({ flywheel: true, intake: true, drive: true });
    assert.equal(sources.length, 3);
    audio.update({ intake: true });
    assert.equal(audio.voices.size, 1);
    assert.equal(sources[0].stops, 1);
    assert.equal(sources[2].stops, 1);
    audio.update({});
    assert.equal(audio.voices.size, 0);
  });
  it('loading after stop/reset never starts a stale loop', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { audio, sources } = fixture(async () => { await gate; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; });
    audio.update({ flywheel: true });
    const loading = audio.setEnabled(true);
    audio.stopAll(); release(); await loading;
    assert.equal(sources.length, 0);
  });
  it('bounds collision playback to a single non-looping voice', async () => {
    const { audio, sources } = fixture();
    await audio.setEnabled(true);
    audio.impact(); audio.impact();
    assert.equal(audio.voices.size, 1);
    assert.equal(sources[0].stops, 1);
    assert.equal(sources[1].loop, false);
    sources[1].onended();
    assert.equal(audio.voices.size, 0);
  });
  it('mute/dispose stop all voices and prevent later playback', async () => {
    const { audio, sources, context } = fixture();
    await audio.setEnabled(true);
    audio.update({ intake: true }); audio.impact();
    await audio.setEnabled(false);
    assert.ok(sources.every((s) => s.stops === 1));
    audio.update({ drive: true });
    assert.equal(audio.voices.size, 0);
    audio.dispose(); await audio.setEnabled(true);
    assert.equal(context.state, 'closed');
    assert.equal(audio.voices.size, 0);
  });
  it('handles missing files and autoplay rejection without unhandled rejections', async () => {
    const { audio, errors } = fixture(async () => ({ ok: false, status: 404 }));
    await audio.setEnabled(true);
    assert.equal(audio.enabled, false);
    assert.ok(errors.length > 0);
    assert.equal(audio.voices.size, 0);
    const f = fixture();
    f.context.resume = () => Promise.reject(new Error('NotAllowedError'));
    await f.audio.setEnabled(true);
    assert.equal(f.audio.enabled, false);
    assert.equal(f.errors.length, 1);
  });
});

function impactFixture() {
  const model = { ngeom: 8, body_parentid: [0, 0, 1, 0, 0], geom_bodyid: [0, 0, 1, 2, 0, 3, 3, 4] };
  const mujoco = { mjtObj: { mjOBJ_BODY: { value: 1 }, mjOBJ_GEOM: { value: 2 } }, mj_name2id: (_, kind, name) => name === 'robot' ? 1 : name === 'ground' ? 0 : name === 'tiles' ? 1 : -1 };
  const detector = new RobotImpacts(mujoco, model);
  const sample = (time, pairs = []) => detector.sample({ time, ncon: pairs.length, contact: { get: (i) => ({ geom1: pairs[i][0], geom2: pairs[i][1], dist: pairs[i][2] ?? -0.001, exclude: pairs[i][3] ?? 0 }) } });
  return { detector, sample };
}

describe('robot collision edges', () => {
  it('ignores floor, self, non-robot, inactive and margin-only contacts', () => {
    const { sample } = impactFixture(); sample(0);
    assert.equal(sample(0.1, [[0, 3], [1, 2], [2, 3], [5, 6], [2, 4, 0.01], [2, 5, -0.1, 1]]), false);
  });
  it('plays once per impact, not contact point or continued/jittery contact', () => {
    const { sample } = impactFixture(); sample(0);
    assert.equal(sample(0.1, [[2, 5], [3, 6]]), true);
    assert.equal(sample(0.2, [[2, 5], [3, 6]]), false);
    sample(0.25);
    assert.equal(sample(0.3, [[3, 6]]), false);
    sample(0.5);
    assert.equal(sample(0.6, [[3, 6]]), true);
  });
  it('ignores spawn contacts and re-primes on reset or time reversal', () => {
    const { detector, sample } = impactFixture();
    assert.equal(sample(0, [[2, 4]]), false);
    assert.equal(sample(0.1, [[2, 4]]), false);
    detector.reset();
    assert.equal(sample(0, [[2, 4]]), false);
    assert.equal(sample(-1, [[2, 7]]), false);
  });
  it('detects a second obstacle while touching the first', () => {
    const { sample } = impactFixture(); sample(0);
    assert.equal(sample(0.1, [[2, 5]]), true);
    assert.equal(sample(0.4, [[2, 5], [3, 7]]), true);
    assert.equal(sample(0.5, [[2, 5], [3, 7]]), false);
  });
});

function adapterFixture() {
  const a = Object.create(BiobuzzHardwareAdapter.prototype);
  Object.assign(a, { model: { nu: 2 }, data: { ctrl: [0, 0] }, _motorMeta: {}, _thr: { intakeOn: 0.05, crServoEject: 0.3, flywheelShoot: 0.3, pollenServoPlace: 0.7 }, _lastCmds: {}, mech: { setIntakePower() {}, fire() {}, tryPlaceNectar() {} } });
  return a;
}

describe('resolved motor sound state', () => {
  it('signed power, velocity-only flywheel, and zero speed', () => {
    const a = adapterFixture();
    a.applyCommands({ intakeMotorAsDcMotor: { type: 'motor', power: -1 }, flywheelAsDcMotor: { type: 'motor', velocityMode: true, velocityTicksPerSec: -1000 } });
    assert.deepEqual(a.audioState, { intake: true, flywheel: true, drive: false });
    a.applyCommands({ flywheelAsDcMotor: { type: 'motor', velocityMode: true, velocityTicksPerSec: 0, power: 1 } });
    assert.deepEqual(a.audioState, { intake: false, flywheel: false, drive: false });
  });
  it('RUN_TO_POSITION stops audio at target despite nonzero power', () => {
    const a = adapterFixture();
    a._motorMeta.leftDriveAsDcMotor = { ticksPerRad: 1, maxRadPerSec: 1, tol: 10 };
    a._motorSensor = () => ({ positionTicks: 100 });
    const cmd = { type: 'motor', jsId: 'leftDriveAsDcMotor', mode: 'RUN_TO_POSITION', targetPosition: 100, targetTolerance: 10, power: 1 };
    a.applyCommands({ leftDriveAsDcMotor: cmd });
    assert.equal(a.audioState.drive, false);
    a.applyCommands({ leftDriveAsDcMotor: { ...cmd, targetPosition: 200 } });
    assert.equal(a.audioState.drive, true);
  });
  it('zeroAll clears audio, flywheel and feeder; idle tracks held controls', () => {
    const a = adapterFixture();
    a.applyTeleop({ left: -1, right: 1, intake: 1, flywheel: true });
    assert.deepEqual(a.audioState, { intake: true, flywheel: true, drive: true });
    a._feeding = true; a._flyTarget = 1000; a.zeroAll();
    assert.deepEqual(a.audioState, {});
    assert.equal(a._feeding, false);
    assert.equal(a._flyTarget, 0);
    assert.equal(a._flyVel, 0);
  });
});
