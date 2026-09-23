/**
 * visionPortalAccess — simulated VisionPortal (no real camera stream).
 * Streaming stubs report OPENED/STREAMING; camera controls are no-op stubs.
 */

import {
  createExposureControl,
  createFocusControl,
  createGainControl,
  createPtzControl,
  createWhiteBalanceControl,
  exposureControlAccess,
  focusControlAccess,
  gainControlAccess,
  ptzControlAccess,
  whiteBalanceControlAccess,
} from './cameraControls.js';

export {
  exposureControlAccess,
  focusControlAccess,
  gainControlAccess,
  ptzControlAccess,
  whiteBalanceControlAccess,
};

const UNSUPPORTED = (name) => {
  throw new Error(
    `Niet ondersteund in MuJoCo-simulator (simulated VisionPortal): visionPortalAccess.${name}() — geen echte camera/CV.`,
  );
};

export function createVisionPortalAccess() {
  const portals = new WeakMap();
  const controls = new WeakMap();

  function ensureState(portal) {
    if (!portal) return { streaming: true, state: 'STREAMING' };
    if (!portals.has(portal)) {
      portals.set(portal, { streaming: true, state: 'STREAMING' });
    }
    return portals.get(portal);
  }

  function ensureControls(portal) {
    const key = portal && typeof portal === 'object' ? portal : null;
    if (!key) {
      return {
        exposure: createExposureControl(),
        focus: createFocusControl(),
        gain: createGainControl(),
        ptz: createPtzControl(),
        whiteBalance: createWhiteBalanceControl(),
      };
    }
    if (!controls.has(key)) {
      controls.set(key, {
        exposure: createExposureControl(),
        focus: createFocusControl(),
        gain: createGainControl(),
        ptz: createPtzControl(),
        whiteBalance: createWhiteBalanceControl(),
      });
    }
    return controls.get(key);
  }

  return {
    easyCreateWithDefaults_oneProcessor(camera, processor) {
      return {
        __type: 'VisionPortal',
        camera,
        processors: processor ? [processor] : [],
      };
    },
    easyCreateWithDefaults_twoProcessors(camera, p1, p2) {
      return {
        __type: 'VisionPortal',
        camera,
        processors: [p1, p2].filter(Boolean),
      };
    },

    createBuilder() {
      return { __type: 'VisionPortal.Builder', _cfg: { processors: [] } };
    },
    setCamera(builder, camera) {
      if (builder) builder._cfg = { ...builder._cfg, camera };
    },
    setStreamFormat(builder, fmt) {
      if (builder) builder._cfg = { ...builder._cfg, streamFormat: fmt };
    },
    enableLiveView(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, liveView: v };
    },
    setAutoStopLiveView(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, autoStop: v };
    },
    setAutoStartStreamOnBuild(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, autoStart: v };
    },
    setShowStatsOverlay(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, stats: v };
    },
    setLiveViewContainerId(builder, id) {
      if (builder) builder._cfg = { ...builder._cfg, containerId: id };
    },
    setCameraResolution(builder) {
      return builder;
    },
    addProcessor(builder, processor) {
      if (builder) {
        const procs = [...(builder._cfg.processors || []), processor];
        builder._cfg = { ...builder._cfg, processors: procs };
      }
    },
    build(builder) {
      const cfg = (builder && builder._cfg) || {};
      return {
        __type: 'VisionPortal',
        camera: cfg.camera,
        processors: cfg.processors || [],
      };
    },

    getCameraState(portal) {
      const st = ensureState(portal);
      return st.streaming ? 'STREAMING' : 'CAMERA_DEVICE_CLOSED';
    },
    stopStreaming(portal) {
      const st = ensureState(portal);
      st.streaming = false;
      st.state = 'CAMERA_DEVICE_READY';
    },
    resumeStreaming(portal) {
      const st = ensureState(portal);
      st.streaming = true;
      st.state = 'STREAMING';
    },
    stopLiveView() {},
    resumeLiveView() {},
    getFps() {
      return 30;
    },
    setProcessorEnabled(portal, processor, enabled) {
      if (processor) processor.enabled = !!enabled;
    },
    getProcessorEnabled(_portal, processor) {
      return processor ? processor.enabled !== false : false;
    },
    close(portal) {
      const st = ensureState(portal);
      st.streaming = false;
      st.state = 'CAMERA_DEVICE_CLOSED';
    },
    saveNextFrameRaw() {
      UNSUPPORTED('saveNextFrameRaw');
    },
    getExposureControl(portal) {
      return ensureControls(portal).exposure;
    },
    getFocusControl(portal) {
      return ensureControls(portal).focus;
    },
    getGainControl(portal) {
      return ensureControls(portal).gain;
    },
    getPtzControl(portal) {
      return ensureControls(portal).ptz;
    },
    getWhiteBalanceControl(portal) {
      return ensureControls(portal).whiteBalance;
    },
    setActiveCamera() {
      UNSUPPORTED('setActiveCamera');
    },
    getActiveCamera(portal) {
      return portal && portal.camera;
    },
    cameraStreamServer_setSource() {},
    makeMultiPortalView() {
      return [];
    },
    cameraCompatibilityManager_addQuirk() {},
    cameraCompatibilityManager_removeQuirk() {},
    cameraCompatibilityManager_getQuirks() {
      return [];
    },
  };
}

/** navigationAccess — webcam name handle for VisionPortal.easyCreate */
export const navigationAccess = {
  getWebcamName(name) {
    return { __type: 'WebcamName', name: String(name) };
  },
};

/** Parameter / orientation stubs used by imu_initialize shadows */
export const bno055imuParametersAccess = {
  create(orientation) {
    return { __type: 'IMU.Parameters', imuOrientationOnRobot: orientation };
  },
};

/** Modern IMU.Parameters — generators use imuParametersAccess.create(...) */
export const imuParametersAccess = {
  create(orientation) {
    return { __type: 'IMU.Parameters', imuOrientationOnRobot: orientation };
  },
};

export const revHubOrientationOnRobotAccess = {
  create1(logo, usb) {
    return {
      __type: 'RevHubOrientationOnRobot',
      logoFacingDirection: logo,
      usbFacingDirection: usb,
    };
  },
  create2(logo, usb) {
    return revHubOrientationOnRobotAccess.create1(logo, usb);
  },
  create3(a, b, c) {
    return { __type: 'RevHubOrientationOnRobot', zyx: [a, b, c] };
  },
  zyxOrientation(z, y, x) {
    return { __type: 'YawPitchRollAngles', z, y, x };
  },
  xyzOrientation(x, y, z) {
    return { __type: 'YawPitchRollAngles', x, y, z };
  },
};
