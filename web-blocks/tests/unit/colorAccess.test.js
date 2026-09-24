import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  colorAccess,
  rgbToColor,
  argbToColor,
  getRed,
  getGreen,
  getBlue,
  getAlpha,
  textToColor,
  hsvToColor,
  getHue,
} from '../../src/ftc-runtime/colorAccess.js';

describe('colorAccess', () => {
  it('rgb roundtrip via packed ARGB', () => {
    const c = rgbToColor(10, 20, 30);
    assert.equal(getRed(c), 10);
    assert.equal(getGreen(c), 20);
    assert.equal(getBlue(c), 30);
    assert.equal(getAlpha(c), 255);
  });

  it('argb packs alpha', () => {
    const c = argbToColor(128, 1, 2, 3);
    assert.equal(getAlpha(c), 128);
    assert.equal(getRed(c), 1);
    assert.equal(getGreen(c), 2);
    assert.equal(getBlue(c), 3);
  });

  it('textToColor parses hex and named colors', () => {
    assert.equal(getRed(textToColor('#FF0000')), 255);
    assert.equal(getBlue(textToColor('blue')), 255);
    assert.equal(colorAccess.textToColor('red') | 0, rgbToColor(255, 0, 0) | 0);
  });

  it('hsv red has hue near 0', () => {
    const c = hsvToColor(0, 1, 1);
    assert.equal(getRed(c), 255);
    assert.ok(Math.abs(getHue(c)) < 1e-6 || Math.abs(getHue(c) - 360) < 1e-6);
  });
});
