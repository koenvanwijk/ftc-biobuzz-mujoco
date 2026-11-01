/**
 * VisionPortal.Builder.setCamera met een webcamnaam die NIET in de robotconfiguratie staat → null,
 * en build() faalt dan zoals op de Driver Hub. Alle voorbeelden gebruiken alleen geconfigureerde webcams.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { HARDWARE } from '../../src/config/hardware.js';

const SRC = readFileSync(new URL('../../src/execution/opModeWorker.js', import.meta.url), 'utf8');
const PUB = readFileSync(new URL('../../public/execution/opModeWorker.js', import.meta.url), 'utf8');
const EX = new URL('../../examples/', import.meta.url);

describe('webcam-configuratie (Driver Hub: build zonder camera)', () => {
  it('worker kent precies de geconfigureerde webcams en geeft null voor onbekende namen', () => {
    for (const s of [SRC, PUB]) {
      assert.match(s, /CONFIGURED_WEBCAMS = \['Webcam 1', 'Webcam 2'\]/);
      assert.match(s, /if \(!CONFIGURED_WEBCAMS\.includes\(n\)\) return null;/);
    }
    assert.equal(HARDWARE.webcam1.configName, 'Webcam 1');
    assert.equal(HARDWARE.webcam2.configName, 'Webcam 2');
  });

  it('elk voorbeeld: elke VisionPortal.Builder heeft setCamera met een geconfigureerde webcam vóór build', () => {
    const ok = [HARDWARE.webcam1.configName, HARDWARE.webcam2.configName];
    for (const f of readdirSync(EX).filter((f) => f.endsWith('.blk'))) {
      const xml = readFileSync(new URL(f, EX), 'utf8');
      const creates = (xml.match(/type="visionPortalBuilder_create_assign"/g) || []).length;
      const builds = (xml.match(/type="visionPortalBuilder_build"/g) || []).length;
      const cams = [...xml.matchAll(/type="visionPortalBuilder_setCamera"[\s\S]*?<field name="WEBCAM_NAME">([^<]*)<\/field>/g)].map((m) => m[1]);
      assert.equal(builds, creates, `${f}: build per builder`);
      assert.equal(cams.length, creates, `${f}: setCamera per builder`);
      for (const c of cams) assert.ok(ok.includes(c), `${f}: webcam "${c}" staat niet in de config`);
      // setCamera komt vóór de bijbehorende build.
      let idx = 0;
      for (let i = 0; i < creates; i++) {
        const c = xml.indexOf('visionPortalBuilder_setCamera', idx);
        const b = xml.indexOf('visionPortalBuilder_build', idx);
        assert.ok(c >= 0 && c < b, `${f}: setCamera vóór build (#${i + 1})`);
        idx = b + 1;
      }
    }
  });
});
