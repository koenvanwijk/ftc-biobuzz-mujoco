/**
 * Color access — matches Blocks `colorAccess.*` (Android Color ARGB packing).
 * Packed int: (a<<24)|(r<<16)|(g<<8)|b with components 0–255 (signed int32).
 */

function clampByte(n) {
  const v = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(255, v));
}

/** Pack ARGB into signed 32-bit int (Java Color int). */
export function argbToColor(a, r, g, b) {
  const aa = clampByte(a);
  const rr = clampByte(r);
  const gg = clampByte(g);
  const bb = clampByte(b);
  return ((aa << 24) | (rr << 16) | (gg << 8) | bb) | 0;
}

export function rgbToColor(r, g, b) {
  return argbToColor(255, r, g, b);
}

function unpack(color) {
  const c = Number(color) | 0;
  return {
    a: (c >>> 24) & 0xff,
    r: (c >>> 16) & 0xff,
    g: (c >>> 8) & 0xff,
    b: c & 0xff,
  };
}

export function getRed(color) {
  return unpack(color).r;
}
export function getGreen(color) {
  return unpack(color).g;
}
export function getBlue(color) {
  return unpack(color).b;
}
export function getAlpha(color) {
  return unpack(color).a;
}

/** RGB 0–255 → HSV { h:0–360, s:0–1, v:0–1 } (Android Color.RGBToHSV). */
export function rgbToHsv(r, g, b) {
  const rr = clampByte(r) / 255;
  const gg = clampByte(g) / 255;
  const bb = clampByte(b) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function getHue(color) {
  const { r, g, b } = unpack(color);
  return rgbToHsv(r, g, b).h;
}
export function getSaturation(color) {
  const { r, g, b } = unpack(color);
  return rgbToHsv(r, g, b).s;
}
export function getValue(color) {
  const { r, g, b } = unpack(color);
  return rgbToHsv(r, g, b).v;
}

export function rgbToHue(r, g, b) {
  return rgbToHsv(r, g, b).h;
}
export function rgbToSaturation(r, g, b) {
  return rgbToHsv(r, g, b).s;
}
export function rgbToValue(r, g, b) {
  return rgbToHsv(r, g, b).v;
}

/** HSV → RGB bytes (Android Color.HSVToColor). h 0–360, s/v 0–1. */
export function hsvToRgb(h, s, v) {
  let hh = Number(h) || 0;
  const ss = Math.max(0, Math.min(1, Number(s) || 0));
  const vv = Math.max(0, Math.min(1, Number(v) || 0));
  hh = ((hh % 360) + 360) % 360;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function hsvToColor(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToColor(r, g, b);
}

export function ahsvToColor(a, h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return argbToColor(a, r, g, b);
}

const NAMED = {
  black: 0xff000000 | 0,
  blue: 0xff0000ff | 0,
  cyan: 0xff00ffff | 0,
  dkgray: 0xff444444 | 0,
  darkgray: 0xff444444 | 0,
  gray: 0xff888888 | 0,
  grey: 0xff888888 | 0,
  green: 0xff00ff00 | 0,
  ltgray: 0xffcccccc | 0,
  lightgray: 0xffcccccc | 0,
  magenta: 0xffff00ff | 0,
  red: 0xffff0000 | 0,
  white: 0xffffffff | 0,
  yellow: 0xffffff00 | 0,
  transparent: 0x00000000 | 0,
};

export function textToColor(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return 0;
  const lower = raw.toLowerCase();
  if (lower in NAMED) return NAMED[lower];
  let hex = raw.startsWith('#') ? raw.slice(1) : raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) hex = `FF${hex}`;
  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    return (parseInt(hex, 16) | 0);
  }
  return 0;
}

export function toText(color) {
  const { a, r, g, b } = unpack(color);
  const hex = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
  return `#${hex.toString(16).padStart(8, '0').toUpperCase()}`;
}

export function showColor(_color) {
  // No-op in sim (Blocks uses JavaUtil.showColor for UI).
  return undefined;
}

export const colorAccess = {
  getRed,
  getGreen,
  getBlue,
  getAlpha,
  getHue,
  getSaturation,
  getValue,
  rgbToColor,
  argbToColor,
  hsvToColor,
  ahsvToColor,
  textToColor,
  rgbToHue,
  rgbToSaturation,
  rgbToValue,
  toText,
  showColor,
};
