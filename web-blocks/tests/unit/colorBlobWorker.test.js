/**
 * ColorBlobLocator end-to-end through the real OpMode worker (JS-Interpreter): builder settings,
 * processor filters/sort/enable survive the interpreter boundary, the Util helpers the FTC
 * generators emit (colorBlobsFilterByCriteria, ...) exist, and Circle uses the FTC property names.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function runWorker(code, blobs) {
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
  const sensors = { colorBlobDetections: { json: JSON.stringify(blobs), count: blobs.length } };
  send({ type: 'init', code, sensors, supplyVoltage: 12.5, motorDefaultDirections: {}, debug: { enabled: false } });
  let t = 0;
  const finished = () => messages.some((m) => m.type === 'done' || m.type === 'error');
  for (let i = 0; i < 5; i++) send({ type: 'clock', timeSec: (t += 0.016), sensors, gamepads: { g1: {}, g2: {} } });
  send({ type: 'start' });
  for (let i = 0; i < 200 && !finished(); i++) {
    send({ type: 'clock', timeSec: (t += 0.016), sensors, gamepads: { g1: {}, g2: {} } });
  }
  const err = messages.find((m) => m.type === 'error');
  if (err) throw new Error(err.message);
  assert.ok(messages.some((m) => m.type === 'done'), 'OpMode did not finish');
  return Object.fromEntries(messages.filter((m) => m.type === 'telemetryAdd').map((m) => [m.key, m.value]));
}

const blob = (area, x, y, r) => ({
  ContourArea: area, Density: 1, AspectRatio: 1, ArcLength: 2 * Math.PI * r, Circularity: 1,
  Circle: { X: x, Y: y, Radius: r, Center: { x, y } },
});
const BLOBS = [blob(400, 500, 300, 12), blob(100, 100, 100, 6)];

describe('ColorBlobLocator in the OpMode worker', () => {
  it('keeps builder settings, filters, sort and enable state across the interpreter boundary', () => {
    const tel = runWorker(`
function runOpMode() {
  var c = colorBlobLocatorAccess;
  var b = c.createColorBlobLocatorProcessorBuilder();
  c.setTargetColorRange(b, opencvAccess.colorRange("BLUE"));
  telemetry.addData("blue", JSON.parse(c.getBlobs(c.buildColorBlobLocatorProcessor(b))).length);
  var b3 = c.createColorBlobLocatorProcessorBuilder();
  c.setRoi(b3, opencvAccess.asImageCoordinates(0, 0, 320, 240));
  telemetry.addData("roi", JSON.parse(c.getBlobs(c.buildColorBlobLocatorProcessor(b3))).length);
  var b2 = c.createColorBlobLocatorProcessorBuilder();
  c.setTargetColorRange(b2, opencvAccess.colorRange("YELLOW"));
  var p = c.buildColorBlobLocatorProcessor(b2);
  telemetry.addData("all", JSON.parse(c.getBlobs(p)).length);
  var f = c.createColorBlobLocatorProcessorBlobFilter("BY_CONTOUR_AREA", 300, 1000);
  c.addFilter(p, f);
  telemetry.addData("filtered", JSON.parse(c.getBlobs(p)).length);
  telemetry.addData("filterCriteria", getObjectViaJson(miscAccess, f).criteria);
  c.removeFilter(p, f);
  telemetry.addData("unfiltered", JSON.parse(c.getBlobs(p)).length);
  c.setSort(p, c.createColorBlobLocatorProcessorBlobSort("BY_CONTOUR_AREA", "ASCENDING"));
  telemetry.addData("sortedFirst", JSON.parse(c.getBlobs(p))[0].ContourArea);
  visionPortalAccess.setProcessorEnabled(null, p, false);
  telemetry.addData("disabled", JSON.parse(c.getBlobs(p)).length);
  telemetry.addData("enabled", visionPortalAccess.getProcessorEnabled(null, p));
}`, BLOBS);
    assert.equal(tel.blue, 0);
    assert.equal(tel.roi, 1);
    assert.equal(tel.all, 2);
    assert.equal(tel.filtered, 1);
    assert.equal(tel.filterCriteria, 'BY_CONTOUR_AREA');
    assert.equal(tel.unfiltered, 2);
    assert.equal(tel.sortedFirst, 100);
    assert.equal(tel.disabled, 0);
    assert.equal(tel.enabled, false);
  });

  it('provides the ColorBlobLocatorProcessor.Util helpers (in place) and FTC Circle properties', () => {
    const tel = runWorker(`
function runOpMode() {
  var c = colorBlobLocatorAccess;
  var p = c.buildColorBlobLocatorProcessor(c.createColorBlobLocatorProcessorBuilder());
  var blobs = JSON.parse(c.getBlobs(p));
  colorBlobsSortByCriteria("BY_CONTOUR_AREA", "ASCENDING", blobs);
  telemetry.addData("ascFirst", blobs[0].ContourArea);
  colorBlobsSortByArea("DESCENDING", blobs);
  telemetry.addData("descFirst", blobs[0].ContourArea);
  colorBlobsFilterByCriteria("BY_CONTOUR_AREA", 50, 200, blobs);
  telemetry.addData("afterFilter", blobs.length);
  var circle = blobs[0].Circle;
  telemetry.addData("circle", circle.X + "," + circle.Y + "," + circle.Radius + "," + circle.Center.x);
  colorBlobsFilterByDensity(0, 0.5, blobs);
  colorBlobsFilterByAspectRatio(0, 10, blobs);
  colorBlobsSortByDensity("ASCENDING", blobs);
  colorBlobsSortByAspectRatio("ASCENDING", blobs);
  telemetry.addData("empty", blobs.length);
}`, BLOBS);
    assert.equal(tel.ascFirst, 100);
    assert.equal(tel.descFirst, 400);
    assert.equal(tel.afterFilter, 1);
    assert.equal(tel.circle, '100,100,6,100');
    assert.equal(tel.empty, 0);
  });
});
