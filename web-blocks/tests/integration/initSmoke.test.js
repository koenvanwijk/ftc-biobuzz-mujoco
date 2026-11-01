/**
 * INIT-smoketest: elke voorbeeld-.blk gaat door de echte FTC Blocks-generator (headless, jsdom) en
 * daarna door INIT in de echte OpMode-worker tot waitForStart. Elke exception (zoals de
 * IllegalArgumentException van een Builder zonder verplichte setter) laat de test falen, net als
 * INIT op de Control Hub zou falen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blkToJs } from '../helpers/blkToJs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** INIT in de worker: run tot WAIT_FOR_START (of done/error). Geeft { phase, error } terug. */
function runInit(code) {
  const messages = [];
  const workerUrl = pathToFileURL(path.join(root, 'public/execution/opModeWorker.js')).href;
  const sandbox = { URL, console, location: { href: workerUrl }, postMessage: (m) => messages.push(m) };
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  sandbox.importScripts = (...urls) => {
    for (const u of urls) {
      const f = fileURLToPath(u);
      vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    }
  };
  vm.runInContext(fs.readFileSync(fileURLToPath(workerUrl), 'utf8'), ctx, { filename: 'opModeWorker.js' });
  const send = (m) => sandbox.onmessage({ data: m });
  send({
    type: 'loadInterpreter',
    acornUrl: pathToFileURL(path.join(root, 'public/vendor/js-interpreter/acorn.js')).href,
    interpreterUrl: pathToFileURL(path.join(root, 'public/vendor/js-interpreter/interpreter.js')).href,
  });
  const sensors = { colorBlobDetections: { json: '[]', count: 0 } };
  send({ type: 'init', code, sensors, supplyVoltage: 12.5, motorDefaultDirections: {}, debug: { enabled: false } });
  const waiting = () => messages.some((m) => m.type === 'status' && m.phase === 'WAIT_FOR_START');
  const ended = () => messages.some((m) => m.type === 'done' || m.type === 'error');
  let t = 0;
  for (let i = 0; i < 300 && !waiting() && !ended(); i++) {
    send({ type: 'clock', timeSec: (t += 0.016), sensors, gamepads: { g1: {}, g2: {} } });
  }
  const err = messages.find((m) => m.type === 'error');
  return { waiting: waiting(), done: messages.some((m) => m.type === 'done'), error: err ? String(err.message) : null };
}

const examples = fs.readdirSync(path.join(root, 'examples')).filter((f) => f.endsWith('.blk')).sort();

describe('INIT-smoketest van alle voorbeelden (generator → worker)', () => {
  it('vindt de vision-voorbeelden', () => {
    assert.ok(examples.includes('StarterBot_ImuHiveAuto.blk'));
    assert.ok(examples.includes('StarterBot_ImuAprilTag.blk'));
  });
  for (const name of examples) {
    it(`${name}: INIT zonder exception (tot waitForStart)`, () => {
      const code = blkToJs(name);
      assert.match(code, /function runOpMode\(\)/);
      const r = runInit(code);
      assert.equal(r.error, null, `INIT gooide: ${r.error}`);
      // DebugDemo heeft geen waitForStart en loopt in INIT gewoon af.
      assert.ok(r.waiting || r.done, 'OpMode bereikte waitForStart niet');
    });
  }
});

describe('INIT faalt zoals op de robot bij ontbrekende verplichte Builder-setters (ImuHiveAuto)', () => {
  const code = blkToJs('StarterBot_ImuHiveAuto.blk');
  const without = (re) => {
    const lines = code.split('\n');
    const kept = lines.filter((l) => !re.test(l));
    assert.equal(lines.length - kept.length >= 1, true, `geen regel gevonden voor ${re}`);
    return kept.join('\n');
  };
  it('de generator zet setTargetColorRange + setContourMode vóór buildColorBlobLocatorProcessor', () => {
    const iBuild = code.indexOf('buildColorBlobLocatorProcessor(');
    assert.ok(code.indexOf('setContourMode(') >= 0 && code.indexOf('setContourMode(') < iBuild);
    assert.ok(code.indexOf('setTargetColorRange(') >= 0 && code.indexOf('setTargetColorRange(') < iBuild);
  });
  it('zonder setContourMode: "You must set a contour mode!"', () => {
    const r = runInit(without(/colorBlobLocatorAccess\.setContourMode\(/));
    assert.match(r.error || '', /IllegalArgumentException - You must set a contour mode!/);
  });
  it('zonder setTargetColorRange: "You must set a color range!"', () => {
    const r = runInit(without(/colorBlobLocatorAccess\.setTargetColorRange\(/));
    assert.match(r.error || '', /IllegalArgumentException - You must set a color range!/);
  });
  it('zonder VisionPortal.Builder.setCamera: "You can\'t build a vision portal without setting a camera!"', () => {
    const r = runInit(without(/visionPortalAccess\.setCamera\(/));
    assert.match(r.error || '', /IllegalArgumentException - You can't build a vision portal without setting a camera!/);
  });
});
