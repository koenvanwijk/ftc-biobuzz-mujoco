/**
 * System helpers — Blocks `systemAccess.nanoTime` / `currentTimeMillis`.
 * Uses simulated time (seconds), not wall clock.
 */

/**
 * @param {() => number} getTimeSec
 */
export function createSystemAccess(getTimeSec) {
  return {
    nanoTime() {
      return Math.floor(Number(getTimeSec()) * 1e9);
    },
    currentTimeMillis() {
      return Math.floor(Number(getTimeSec()) * 1000);
    },
  };
}
