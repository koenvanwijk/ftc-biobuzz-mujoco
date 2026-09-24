import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ServoBridge } from '../../src/ftc-runtime/servo.js';
import { CRServoBridge } from '../../src/ftc-runtime/crServo.js';

describe('Servo vs CRServo', () => {
  it('positional servo publishes position01', () => {
    const cmds = [];
    const s = new ServoBridge('pollenServoAsServo', { publishCommand: (c) => cmds.push(c) });
    s.setPosition(0.75);
    assert.equal(cmds.at(-1).type, 'servo');
    assert.equal(cmds.at(-1).position01, 0.75);
  });

  it('CRServo publishes power as velocity device', () => {
    const cmds = [];
    const s = new CRServoBridge('crServoAsCRServo', { publishCommand: (c) => cmds.push(c) });
    s.setDirection('REVERSE');
    s.setPower(0.5);
    assert.equal(cmds.at(-1).type, 'crServo');
    assert.equal(cmds.at(-1).power, -0.5);
    assert.equal('position01' in cmds.at(-1), false);
  });
});
