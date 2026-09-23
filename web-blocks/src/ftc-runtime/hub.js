import { DEFAULT_SUPPLY_VOLTAGE } from '../config/hardware.js';

/** ControlHubAsVoltageSensor — vaste configureerbare voedingsspanning. */
export class VoltageSensorBridge {
  constructor(voltage = DEFAULT_SUPPLY_VOLTAGE) {
    this._voltage = voltage;
  }

  getVoltage() {
    return this._voltage;
  }

  setSimVoltage(v) {
    this._voltage = Number(v);
  }
}

/** ControlHubAsServoController — PWM enable/disable met gesimuleerde status. */
export class ServoControllerBridge {
  constructor() {
    this._pwm = true;
  }

  pwmEnable() {
    this._pwm = true;
  }

  pwmDisable() {
    this._pwm = false;
  }

  getPwmStatus() {
    return this._pwm ? 'ENABLED' : 'DISABLED';
  }
}

/**
 * ControlHubAsREVModule — minimale stub.
 * Onbekende methodes falen luidruchtig (geen stille placeholders).
 */
export class RevModuleBridge {
  constructor() {
    this._bulkCachingMode = 'OFF';
  }

  setBulkCachingMode(mode) {
    this._bulkCachingMode = String(mode);
  }

  getBulkCachingMode() {
    return this._bulkCachingMode;
  }

  clearBulkCache() {}

  getDeviceName() {
    return 'Control Hub (gesimuleerd)';
  }
}
