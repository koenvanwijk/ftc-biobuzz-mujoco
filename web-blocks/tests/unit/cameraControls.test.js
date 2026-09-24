import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVisionPortalAccess } from '../../src/ftc-runtime/visionPortal.js';
import {
  exposureControlAccess,
  createExposureControl,
  toNanoseconds,
  fromNanoseconds,
} from '../../src/ftc-runtime/cameraControls.js';

describe('cameraControls stubs', () => {
  it('getExposureControl returns an ExposureControl object', () => {
    const portalAccess = createVisionPortalAccess();
    const portal = portalAccess.easyCreateWithDefaults_oneProcessor(
      { __type: 'WebcamName', name: 'Webcam 1' },
      null,
    );
    const ctrl = portalAccess.getExposureControl(portal);
    assert.equal(ctrl.__type, 'ExposureControl');
    assert.equal(ctrl.mode, 'ContinuousAuto');
    assert.ok(typeof ctrl.exposureNs === 'number');
  });

  it('exposureControlAccess setMode/getMode and setExposure/getExposure roundtrip', () => {
    const ctrl = createExposureControl();
    assert.equal(exposureControlAccess.getMode(ctrl), 'ContinuousAuto');
    assert.equal(exposureControlAccess.setMode(ctrl, 'Manual'), true);
    assert.equal(exposureControlAccess.getMode(ctrl), 'Manual');

    assert.equal(exposureControlAccess.setExposure(ctrl, 5, 'MILLISECONDS'), true);
    assert.equal(exposureControlAccess.getExposure(ctrl, 'MILLISECONDS'), 5);
    assert.equal(exposureControlAccess.getExposure(ctrl, 'NANOSECONDS'), 5e6);
    assert.equal(exposureControlAccess.getExposure(ctrl, 'MICROSECONDS'), 5000);

    assert.equal(exposureControlAccess.isExposureSupported(ctrl), true);
    assert.equal(exposureControlAccess.isModeSupported(ctrl, 'Manual'), true);
  });

  it('TimeUnit helpers accept enum-like and case-insensitive names', () => {
    assert.equal(toNanoseconds(10, 'milliseconds'), 10e6);
    assert.equal(toNanoseconds(1, { name: 'SECONDS' }), 1e9);
    assert.equal(fromNanoseconds(10e6, 'MILLISECONDS'), 10);
  });
});
