import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHardwareConfigXml, SYNTHETIC_HARDWARE_XML, makeIdentifier } from '../../src/config/hardwareXml.js';

/** Minimal DOMParser polyfill for tests (XML only). */
function installDomParser() {
  if (typeof globalThis.DOMParser !== 'undefined') return;
  globalThis.DOMParser = class {
    parseFromString(text) {
      // ultra-light: use regex walk via create structure with linked nodes
      const { JSDOM } = { JSDOM: null };
      void JSDOM;
      // Use node built-in: experimental? Fall back to xmldom-free recursive parse
      return parseXml(text);
    }
  };
}

function parseXml(text) {
  if (/parsererror|<\?xml/.test(text) === false && !text.includes('<')) {
    return { querySelector: () => ({ textContent: 'err' }), documentElement: null };
  }
  const root = buildTree(text);
  return {
    querySelector: (sel) => (sel === 'parsererror' ? null : null),
    documentElement: root,
  };
}

function buildTree(xml) {
  // Strip XML declaration
  xml = xml.replace(/<\?xml[^?]*\?>/, '').trim();
  const stack = [];
  let root = null;
  const re = /<\/?([A-Za-z0-9_:-]+)([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const full = m[0];
    const tag = m[1];
    const attrsRaw = m[2] || '';
    const selfClosing = full.endsWith('/>') || full.startsWith('<?');
    const closing = full.startsWith('</');
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const am of attrsRaw.matchAll(/([A-Za-z0-9_:]+)="([^"]*)"/g)) {
      attrs[am[1]] = am[2];
    }
    const el = {
      nodeType: 1,
      tagName: tag,
      children: [],
      getAttribute: (n) => attrs[n] ?? null,
    };
    if (!root) root = el;
    if (stack.length) stack[stack.length - 1].children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;
}

installDomParser();

describe('hardware XML parser', () => {
  it('makeIdentifier matches FTC rules', () => {
    assert.equal(makeIdentifier('leftDrive'), 'leftDrive');
    assert.equal(makeIdentifier('Control Hub'), 'ControlHub');
  });

  it('parses synthetic fixture', () => {
    const { devices, identifiers, missingSimBindings } = parseHardwareConfigXml(
      SYNTHETIC_HARDWARE_XML,
    );
    assert.ok(devices.length >= 6);
    assert.equal(identifiers.leftDrive, 'leftDriveAsDcMotor');
    assert.equal(identifiers.pollenServo, 'pollenServoAsServo');
    assert.equal(identifiers.crServo, 'crServoAsCRServo');
    assert.ok(Array.isArray(missingSimBindings));
  });

  it('reports missing sim bindings for unknown motor', () => {
    const xml2 = `<?xml version='1.0'?><Robot>
      <LynxModule name="Control Hub" port="173">
        <Motor name="extraMotor" port="5" />
      </LynxModule>
    </Robot>`;
    const r = parseHardwareConfigXml(xml2);
    assert.ok(r.missingSimBindings.some((s) => s.includes('extraMotor')));
  });
});
