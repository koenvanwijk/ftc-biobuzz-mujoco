/** Range helper — matches Blocks `rangeAccess.clip` / `rangeAccess.scale`. */

export function clip(n, min, max) {
  const v = Number(n);
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(v)) return lo;
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Linear map from [x1, x2] → [y1, y2].
 * When x1 === x2, returns y1 (FTC Range.scale returns y1 for zero span).
 */
export function scale(n, x1, x2, y1, y2) {
  const v = Number(n);
  const a = Number(x1);
  const b = Number(x2);
  const c = Number(y1);
  const d = Number(y2);
  if (a === b) return c;
  return c + ((v - a) * (d - c)) / (b - a);
}

export const rangeAccess = { clip, scale };
