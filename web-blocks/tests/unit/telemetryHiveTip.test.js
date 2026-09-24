import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { composeTelemetry } from '../../src/ui/telemetryView.js';
import { BiobuzzHardwareAdapter } from '../../src/mujoco/BiobuzzHardwareAdapter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('live telemetry around HIVE tips', () => {
  it('recomposes mechanism telemetry even when OpMode telemetry is unchanged', () => {
    const op = 'loop: 42';
    const before = composeTelemetry(op, 'score R0 B0  intake AAN');
    const after = composeTelemetry(op, 'score R20 B0  intake AAN');

    assert.notEqual(before, after);
    assert.match(after, /loop: 42/);
    assert.match(after, /score R20 B0/);
  });

  it('keeps the last HIVE event visible after later HUD refreshes', () => {
    const fake = {
      hiveTip: {
        score: { red: 20, blue: 0 },
        lastEvent: 'HIVE RED TIP +20',
      },
      mech: { count: 4, nectarCount: 0, intakePower: 1 },
      _lastPlaceResult: '',
      _lastShootOk: false,
      _lastHiveEvent: '',
      _aprilCount: 0,
      _hud: {},
    };

    BiobuzzHardwareAdapter.prototype._refreshHud.call(fake);
    assert.equal(fake._hud.hiveEvent, 'HIVE RED TIP +20');
    assert.equal(fake.hiveTip.lastEvent, '');

    fake.hiveTip.score.red = 40;
    BiobuzzHardwareAdapter.prototype._refreshHud.call(fake);
    assert.equal(fake._hud.scoreRed, 40);
    assert.equal(fake._hud.hiveEvent, 'HIVE RED TIP +20');
  });

  it('refreshes the telemetry view every animation frame', () => {
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    const frameStart = main.indexOf('const frame = (now) =>');
    const frameEnd = main.indexOf('anim = requestAnimationFrame(frame);', frameStart + 1);
    const frameBody = main.slice(frameStart, frameEnd);
    assert.ok(frameBody.includes('updateBiobuzzHud();'));
    assert.ok(frameBody.includes('renderTelemetry();'));
  });
});
