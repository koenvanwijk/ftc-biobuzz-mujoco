/** Helpers die de Blocks JS-generator als globals emitteert. */

export function startBlockExecution(label) {
  // Hook voor debugging / block-highlight; altijd true (zie vars.js wrapJavaScriptCode).
  startBlockExecution._lastLabel = label;
  return true;
}

export function endBlockExecution(result) {
  return result;
}

export function listLength(_miscAccess, list) {
  return list ? list.length : 0;
}

export function listIsEmpty(_miscAccess, list) {
  return !list || list.length === 0;
}

/**
 * FTC Blocks helper: parse JSON string or return null.
 * Used by aprilTagProcessor_getFreshDetections / similar generators.
 */
export function nullOrJson(jsonString) {
  if (jsonString == null || jsonString === '') return null;
  return JSON.parse(String(jsonString));
}

/**
 * FTC Blocks helper: evaluate `code` only when `o` is truthy.
 * Generators pass a string of JS that references access objects in the same scope.
 * In Node/unit tests, `eval` runs against globalThis; the worker binds the same names.
 */
export function evalIfTruthy(o, code, defaultValue) {
  if (!o) return defaultValue;
  // eslint-disable-next-line no-eval
  return (0, eval)(String(code));
}

export const miscAccess = {
  formatNumber(n, precision) {
    return Number(n).toFixed(Number(precision) || 0);
  },
  formatNumber_withWidth(n, width, precision) {
    const formatted = Number(n).toFixed(Number(precision) || 0);
    return formatted.padStart(Math.max(0, Number(width) || 0), ' ');
  },
  roundDecimal(n, precision) {
    const p = 10 ** (Number(precision) || 0);
    return Math.round(Number(n) * p) / p;
  },
  min(a, b) {
    return Math.min(a, b);
  },
  max(a, b) {
    return Math.max(a, b);
  },
};
