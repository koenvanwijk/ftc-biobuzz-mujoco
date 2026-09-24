/**
 * ElapsedTime access — Blocks `elapsedTimeAccess.*`.
 * Timers use simulated time from getTimeSec(), never Date.now()/performance.now().
 *
 * Objects are plain `{ startSec, resolution }` with resolution 'SECONDS' | 'MILLISECONDS'.
 */

function normalizeResolution(resolution) {
  if (resolution == null) return 'SECONDS';
  if (typeof resolution === 'object' && resolution !== null) {
    const s = resolution.name || resolution.resolution || resolution.toString?.();
    return String(s).toUpperCase().includes('MILLI') ? 'MILLISECONDS' : 'SECONDS';
  }
  const s = String(resolution).toUpperCase();
  return s.includes('MILLI') ? 'MILLISECONDS' : 'SECONDS';
}

function parseStartSec(startTime, getTimeSec) {
  if (startTime == null || startTime === '') return Number(getTimeSec()) || 0;
  const n = Number(startTime);
  if (!Number.isFinite(n)) return Number(getTimeSec()) || 0;
  // FTC ctor takes System.nanoTime() (large); treat huge values as nanoseconds.
  if (Math.abs(n) > 1e12) return n / 1e9;
  return n;
}

function elapsedSec(t, getTimeSec) {
  const start = t && typeof t.startSec === 'number' ? t.startSec : 0;
  return (Number(getTimeSec()) || 0) - start;
}

/**
 * @param {() => number} getTimeSec
 */
export function createElapsedTimeAccess(getTimeSec) {
  return {
    create() {
      return { startSec: Number(getTimeSec()) || 0, resolution: 'SECONDS' };
    },
    create_withStartTime(startTime) {
      return {
        startSec: parseStartSec(startTime, getTimeSec),
        resolution: 'SECONDS',
      };
    },
    create_withResolution(resolution) {
      return {
        startSec: Number(getTimeSec()) || 0,
        resolution: normalizeResolution(resolution),
      };
    },
    getStartTime(t) {
      const start = t && typeof t.startSec === 'number' ? t.startSec : 0;
      const res = normalizeResolution(t?.resolution);
      // Match ElapsedTime.startTime(): value in resolution units.
      return res === 'MILLISECONDS' ? start * 1000 : start;
    },
    getTime(t) {
      const sec = elapsedSec(t, getTimeSec);
      return normalizeResolution(t?.resolution) === 'MILLISECONDS' ? sec * 1000 : sec;
    },
    getSeconds(t) {
      return elapsedSec(t, getTimeSec);
    },
    getMilliseconds(t) {
      return elapsedSec(t, getTimeSec) * 1000;
    },
    getResolution(t) {
      return normalizeResolution(t?.resolution);
    },
    reset(t) {
      if (t && typeof t === 'object') t.startSec = Number(getTimeSec()) || 0;
    },
    log(t, label) {
      const sec = elapsedSec(t, getTimeSec);
      const msg = `${label != null ? String(label) : 'ElapsedTime'}: ${sec.toFixed(3)} s`;
      if (typeof console !== 'undefined' && console.log) console.log(msg);
    },
    toText(t) {
      return String(elapsedSec(t, getTimeSec));
    },
  };
}
