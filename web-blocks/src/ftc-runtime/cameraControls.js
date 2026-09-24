/**
 * Simulated camera controls for VisionPortal (Exposure / Gain / Focus / WB / PTZ).
 * No-op stubs: get/set succeed and store state; they do not affect any image stream.
 *
 * PTZ getPanTilt / getMin / getMax return JSON **strings** because Blocks generators
 * wrap the call in JSON.parse (same pattern as aprilTag detections).
 */

const DEFAULT_EXPOSURE_NS = 10e6; // ~10 ms

function unitName(unit) {
  if (unit == null) return 'NANOSECONDS';
  if (typeof unit === 'string') return unit.toUpperCase();
  if (typeof unit === 'object') {
    if (typeof unit.name === 'string') return unit.name.toUpperCase();
    if (typeof unit.toString === 'function') {
      const s = String(unit.toString());
      const m = s.match(/(NANOSECONDS|MILLISECONDS|MICROSECONDS|SECONDS|MINUTES|HOURS|DAYS)/i);
      if (m) return m[1].toUpperCase();
      return s.toUpperCase();
    }
  }
  return String(unit).toUpperCase();
}

/** Convert a duration in the given TimeUnit to nanoseconds. */
export function toNanoseconds(duration, unit) {
  const d = Number(duration) || 0;
  switch (unitName(unit)) {
    case 'NANOSECONDS':
    case 'NANOSECOND':
      return d;
    case 'MICROSECONDS':
    case 'MICROSECOND':
      return d * 1e3;
    case 'MILLISECONDS':
    case 'MILLISECOND':
      return d * 1e6;
    case 'SECONDS':
    case 'SECOND':
      return d * 1e9;
    case 'MINUTES':
    case 'MINUTE':
      return d * 60e9;
    case 'HOURS':
    case 'HOUR':
      return d * 3600e9;
    case 'DAYS':
    case 'DAY':
      return d * 86400e9;
    default:
      return d; // assume ns
  }
}

/** Convert nanoseconds to the given TimeUnit. */
export function fromNanoseconds(ns, unit) {
  const n = Number(ns) || 0;
  switch (unitName(unit)) {
    case 'NANOSECONDS':
    case 'NANOSECOND':
      return n;
    case 'MICROSECONDS':
    case 'MICROSECOND':
      return n / 1e3;
    case 'MILLISECONDS':
    case 'MILLISECOND':
      return n / 1e6;
    case 'SECONDS':
    case 'SECOND':
      return n / 1e9;
    case 'MINUTES':
    case 'MINUTE':
      return n / 60e9;
    case 'HOURS':
    case 'HOUR':
      return n / 3600e9;
    case 'DAYS':
    case 'DAY':
      return n / 86400e9;
    default:
      return n;
  }
}

export function createExposureControl() {
  return {
    __type: 'ExposureControl',
    mode: 'ContinuousAuto',
    exposureNs: DEFAULT_EXPOSURE_NS,
    minExposureNs: 1e3, // 1 µs
    maxExposureNs: 100e6, // 100 ms
    aePriority: true,
  };
}

export function createGainControl() {
  return {
    __type: 'GainControl',
    gain: 0,
    minGain: 0,
    maxGain: 100,
  };
}

export function createFocusControl() {
  return {
    __type: 'FocusControl',
    mode: 'ContinuousAuto',
    focusLength: 1.0,
    minFocusLength: 0.1,
    maxFocusLength: 10.0,
  };
}

export function createWhiteBalanceControl() {
  return {
    __type: 'WhiteBalanceControl',
    mode: 'AUTO',
    temperature: 5500,
    minTemperature: 2000,
    maxTemperature: 10000,
  };
}

export function createPtzControl() {
  return {
    __type: 'PtzControl',
    pan: 0,
    tilt: 0,
    minPan: -100,
    maxPan: 100,
    minTilt: -100,
    maxTilt: 100,
    zoom: 1,
    minZoom: 1,
    maxZoom: 10,
  };
}

function ensure(ctrl, fallback) {
  return ctrl && typeof ctrl === 'object' ? ctrl : fallback();
}

export const exposureControlAccess = {
  getMode(ctrl) {
    return ensure(ctrl, createExposureControl).mode;
  },
  setMode(ctrl, mode) {
    const c = ensure(ctrl, createExposureControl);
    c.mode = mode != null ? String(mode) : c.mode;
    return true;
  },
  isModeSupported() {
    return true;
  },
  getExposure(ctrl, unit) {
    const c = ensure(ctrl, createExposureControl);
    return fromNanoseconds(c.exposureNs, unit);
  },
  getMinExposure(ctrl, unit) {
    const c = ensure(ctrl, createExposureControl);
    return fromNanoseconds(c.minExposureNs, unit);
  },
  getMaxExposure(ctrl, unit) {
    const c = ensure(ctrl, createExposureControl);
    return fromNanoseconds(c.maxExposureNs, unit);
  },
  setExposure(ctrl, duration, unit) {
    const c = ensure(ctrl, createExposureControl);
    c.exposureNs = toNanoseconds(duration, unit);
    return true;
  },
  isExposureSupported() {
    return true;
  },
  getAePriority(ctrl) {
    return !!ensure(ctrl, createExposureControl).aePriority;
  },
  setAePriority(ctrl, priority) {
    const c = ensure(ctrl, createExposureControl);
    c.aePriority = !!priority;
    return true;
  },
};

export const gainControlAccess = {
  getGain(ctrl) {
    return ensure(ctrl, createGainControl).gain;
  },
  getMinGain(ctrl) {
    return ensure(ctrl, createGainControl).minGain;
  },
  getMaxGain(ctrl) {
    return ensure(ctrl, createGainControl).maxGain;
  },
  setGain(ctrl, gain) {
    const c = ensure(ctrl, createGainControl);
    c.gain = Number(gain) || 0;
    return true;
  },
};

export const focusControlAccess = {
  getMode(ctrl) {
    return ensure(ctrl, createFocusControl).mode;
  },
  setMode(ctrl, mode) {
    const c = ensure(ctrl, createFocusControl);
    c.mode = mode != null ? String(mode) : c.mode;
    return true;
  },
  isModeSupported() {
    return true;
  },
  getFocusLength(ctrl) {
    return ensure(ctrl, createFocusControl).focusLength;
  },
  getMinFocusLength(ctrl) {
    return ensure(ctrl, createFocusControl).minFocusLength;
  },
  getMaxFocusLength(ctrl) {
    return ensure(ctrl, createFocusControl).maxFocusLength;
  },
  setFocusLength(ctrl, length) {
    const c = ensure(ctrl, createFocusControl);
    c.focusLength = Number(length);
    return true;
  },
  isFocusLengthSupported() {
    return true;
  },
};

export const whiteBalanceControlAccess = {
  getMode(ctrl) {
    return ensure(ctrl, createWhiteBalanceControl).mode;
  },
  setMode(ctrl, mode) {
    const c = ensure(ctrl, createWhiteBalanceControl);
    c.mode = mode != null ? String(mode) : c.mode;
    return true;
  },
  getWhiteBalanceTemperature(ctrl) {
    return ensure(ctrl, createWhiteBalanceControl).temperature;
  },
  getMinWhiteBalanceTemperature(ctrl) {
    return ensure(ctrl, createWhiteBalanceControl).minTemperature;
  },
  getMaxWhiteBalanceTemperature(ctrl) {
    return ensure(ctrl, createWhiteBalanceControl).maxTemperature;
  },
  setWhiteBalanceTemperature(ctrl, kelvin) {
    const c = ensure(ctrl, createWhiteBalanceControl);
    c.temperature = Number(kelvin) || 0;
    return true;
  },
};

function parsePanTilt(holder) {
  if (holder == null) return { pan: 0, tilt: 0 };
  if (typeof holder === 'string') {
    try {
      const o = JSON.parse(holder);
      return { pan: Number(o.pan) || 0, tilt: Number(o.tilt) || 0 };
    } catch (_) {
      return { pan: 0, tilt: 0 };
    }
  }
  if (typeof holder === 'object') {
    return { pan: Number(holder.pan) || 0, tilt: Number(holder.tilt) || 0 };
  }
  return { pan: 0, tilt: 0 };
}

export const ptzControlAccess = {
  getPanTilt(ctrl) {
    const c = ensure(ctrl, createPtzControl);
    return JSON.stringify({ pan: c.pan, tilt: c.tilt });
  },
  getMinPanTilt(ctrl) {
    const c = ensure(ctrl, createPtzControl);
    return JSON.stringify({ pan: c.minPan, tilt: c.minTilt });
  },
  getMaxPanTilt(ctrl) {
    const c = ensure(ctrl, createPtzControl);
    return JSON.stringify({ pan: c.maxPan, tilt: c.maxTilt });
  },
  setPanTilt(ctrl, holder) {
    const c = ensure(ctrl, createPtzControl);
    const pt = parsePanTilt(holder);
    c.pan = pt.pan;
    c.tilt = pt.tilt;
    return true;
  },
  getZoom(ctrl) {
    return ensure(ctrl, createPtzControl).zoom;
  },
  getMinZoom(ctrl) {
    return ensure(ctrl, createPtzControl).minZoom;
  },
  getMaxZoom(ctrl) {
    return ensure(ctrl, createPtzControl).maxZoom;
  },
  setZoom(ctrl, zoom) {
    const c = ensure(ctrl, createPtzControl);
    c.zoom = Number(zoom) || 0;
    return true;
  },
};
