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
function runInit(code, extraSensors = {}) {
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
  const sensors = { colorBlobDetections: { json: '[]', count: 0 }, ...extraSensors };
  send({ type: 'init', code, sensors, supplyVoltage: 12.5, motorDefaultDirections: {}, debug: { enabled: false } });
  const waiting = () => messages.some((m) => m.type === 'status' && m.phase === 'WAIT_FOR_START');
  const ended = () => messages.some((m) => m.type === 'done' || m.type === 'error');
  let t = 0;
  for (let i = 0; i < 300 && !waiting() && !ended(); i++) {
    send({ type: 'clock', timeSec: (t += 0.016), sensors, gamepads: { g1: {}, g2: {} } });
  }
  const err = messages.find((m) => m.type === 'error');
  const cmds = messages.filter((m) => m.type === 'commands').map((m) => m.commands);
  const last = cmds.length ? cmds[cmds.length - 1] : {};
  return {
    waiting: waiting(),
    done: messages.some((m) => m.type === 'done'),
    error: err ? String(err.message) : null,
    activeCamera: last.__activeCamera ? last.__activeCamera.camera : null,
  };
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

/**
 * Meerdere camera's zoals op de robot (FTC SDK 12, VisionPortalImpl): twee portals met de standaard
 * live view → IllegalStateException; het FTC-voorbeeld ConceptAprilTagSwitchableCameras gebruikt één
 * portal met een switchable camera (setActiveCamera). In de sim is altijd maar één camera actief.
 */
describe('Multi-camera: één actieve camera, multi-portal live-view-regel (zoals de SDK)', () => {
  const prog = (body) => `function runOpMode() {\n${body}\n  linearOpMode.waitForStart();\n}\n`;
  const portal = (v, cam, extra = '') => `
  var ${v}B = visionPortalAccess.createBuilder();
  visionPortalAccess.setCamera(${v}B, navigationAccess.getWebcamName("${cam}"));
  ${extra.replaceAll('B,', `${v}B,`)}
  var ${v} = visionPortalAccess.build(${v}B);`;
  const MULTI = /IllegalStateException - When using multiple vision portals, you MUST use setLiveViewContainerId\(int\), NOT enableLiveView\(bool\)/;

  it('ImuHiveAuto: één VisionPortal met switchable camera; Webcam 2 alleen rond rearCollect', () => {
    const code = blkToJs('StarterBot_ImuHiveAuto.blk');
    assert.equal((code.match(/visionPortalAccess\.build\(/g) || []).length, 1);
    assert.match(code, /setCamera\(myVisionPortalBuilder, navigationAccess\.createSwitchableCameraNameForAllWebcams\(\)\)/);
    assert.doesNotMatch(code, /enableLiveView/);
    assert.match(code, /setActiveCamera\(myVisionPortal, navigationAccess\.getWebcamName\("Webcam 2"\)\);\s*rearCollect\([^)]*\);\s*visionPortalAccess\.setActiveCamera\(myVisionPortal, navigationAccess\.getWebcamName\("Webcam 1"\)\);/);
    const r = runInit(code);
    assert.equal(r.error, null);
    assert.equal(r.activeCamera, 'Webcam 1');
  });
  it('twee portals met standaard live view → zelfde IllegalStateException als de Hub', () => {
    const r = runInit(prog(portal('a', 'Webcam 1') + portal('b', 'Webcam 2')));
    assert.match(r.error || '', MULTI);
  });
  it('enableLiveView(true) op twee portals → idem', () => {
    const lv = 'visionPortalAccess.enableLiveView(B, true);';
    assert.match(runInit(prog(portal('a', 'Webcam 1', lv) + portal('b', 'Webcam 2', lv))).error || '', MULTI);
  });
  it('setLiveViewContainerId met makeMultiPortalView-ids → OK; laatst gestarte portal is de actieve camera', () => {
    const r = runInit(prog(`  var ids = visionPortalAccess.makeMultiPortalView(2, "HORIZONTAL");` +
      portal('a', 'Webcam 1', 'visionPortalAccess.setLiveViewContainerId(B, ids[0]);') +
      portal('b', 'Webcam 2', 'visionPortalAccess.setLiveViewContainerId(B, ids[1]);') +
      `\n  if (visionPortalAccess.getCameraState(a) == "STREAMING") throw new Error("a streamt nog");`));
    assert.equal(r.error, null);
    assert.equal(r.activeCamera, 'Webcam 2');
  });
  it('zelfde container-id twee keer → "multiple LiveViews with the same View ID"', () => {
    const c = 'visionPortalAccess.setLiveViewContainerId(B, 7);';
    assert.match(runInit(prog(portal('a', 'Webcam 1', c) + portal('b', 'Webcam 2', c))).error || '', /same View ID/);
  });
  it('close() geeft de live view vrij: tweede portal daarna mag wel', () => {
    const r = runInit(prog(portal('a', 'Webcam 1') + '\n  visionPortalAccess.close(a);' + portal('b', 'Webcam 2')));
    assert.equal(r.error, null);
    assert.equal(r.activeCamera, 'Webcam 2');
  });
  it('setActiveCamera op een gewone webcam → UnsupportedOperationException (zoals de SDK)', () => {
    const r = runInit(prog(portal('a', 'Webcam 1') + '\n  visionPortalAccess.setActiveCamera(a, navigationAccess.getWebcamName("Webcam 2"));'));
    assert.match(r.error || '', /UnsupportedOperationException - setActiveCamera is only supported for switchable webcams/);
  });
  it('switchable camera: AprilTags alleen met Webcam 1 actief, POLLEN-blobs alleen met Webcam 2', () => {
    const tag = JSON.stringify([{ id: 1 }]);
    const blob = JSON.stringify([{ Circle: { X: 1, Y: 1 } }]);
    const r = runInit(prog(`
  var t = aprilTagAccess.easyCreateWithDefaults();
  var cbB = colorBlobLocatorAccess.createColorBlobLocatorProcessorBuilder();
  colorBlobLocatorAccess.setTargetColorRange(cbB, opencvAccess.colorRange("YELLOW"));
  colorBlobLocatorAccess.setContourMode(cbB, "EXTERNAL_ONLY");
  var cb = colorBlobLocatorAccess.buildColorBlobLocatorProcessor(cbB);
  var pB = visionPortalAccess.createBuilder();
  visionPortalAccess.setCamera(pB, navigationAccess.createSwitchableCameraNameForAllWebcams());
  visionPortalAccess.addProcessor(pB, t);
  visionPortalAccess.addProcessor(pB, cb);
  var p = visionPortalAccess.build(pB);
  if (JSON.parse(aprilTagAccess.getDetections(t)).length != 1) throw new Error("voor: geen tags");
  if (JSON.parse(colorBlobLocatorAccess.getBlobs(cb)).length != 0) throw new Error("voor: blobs");
  visionPortalAccess.setActiveCamera(p, navigationAccess.getWebcamName("Webcam 2"));
  if (JSON.parse(aprilTagAccess.getDetections(t)).length != 0) throw new Error("achter: tags");
  if (JSON.parse(colorBlobLocatorAccess.getBlobs(cb)).length != 1) throw new Error("achter: geen blobs");`),
    { aprilTagDetections: { json: tag, generation: 1 }, colorBlobDetections: { json: blob, count: 1, camera: 'Webcam 2' } });
    assert.equal(r.error, null);
    assert.equal(r.activeCamera, 'Webcam 2');
  });
});
