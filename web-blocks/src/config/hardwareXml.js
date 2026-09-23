/**
 * Parser voor FTC Robot Controller hardware-config XML.
 * Bouwt identifiers/dropdowns/bindings; rapporteert ontbrekende sim-bindings.
 * Geen echte serienummers — synthetische fixtures voor tests.
 */

import { HARDWARE } from './hardware.js';

const TYPE_TO_SUFFIX = {
  DcMotor: 'AsDcMotor',
  DcMotorEx: 'AsDcMotor',
  Servo: 'AsServo',
  CRServo: 'AsCRServo',
  ContinuousRotationServo: 'AsCRServo',
  VoltageSensor: 'AsVoltageSensor',
  ServoController: 'AsServoController',
  LynxModule: 'AsREVModule',
  LynxUsbDevice: 'AsREVModule',
  IMU: 'AsIMU',
  WebcamName: '',
};

/** Zelfde identifier-algoritme als vendor vars.js makeIdentifier. */
export function makeIdentifier(deviceName) {
  let identifier = '';
  const isStart = (c) => /[a-zA-Z$_]/.test(c);
  const isPart = (c) => /[a-zA-Z0-9$_]/.test(c);
  const c0 = deviceName.charAt(0);
  if (isStart(c0)) identifier += c0;
  else if (isPart(c0)) identifier += `_${c0}`;
  for (let i = 1; i < deviceName.length; i++) {
    const c = deviceName.charAt(i);
    if (isPart(c)) identifier += c;
  }
  return identifier;
}

/**
 * @param {string} xmlText
 * @returns {{ devices: Array, missingSimBindings: string[], identifiers: Record<string,string> }}
 */
export function parseHardwareConfigXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Ongeldige hardware-config XML');
  }

  const devices = [];
  const supportedJs = new Set(Object.values(HARDWARE).map((h) => h.jsId));

  const walk = (el) => {
    if (!el || el.nodeType !== 1) return;
    const name = el.getAttribute('name');
    const type =
      el.getAttribute('type') ||
      el.getAttribute('classname') ||
      el.tagName;
    // FTC XML uses elements like <Motor name="leftDrive" port="0" .../> under Lynx modules
    const tag = el.tagName;
    const mappedType = mapTagToType(tag, type);
    if (name && mappedType) {
      const suffix = TYPE_TO_SUFFIX[mappedType];
      if (suffix !== undefined && suffix !== null) {
        const jsId =
          mappedType === 'WebcamName'
            ? makeIdentifier(name) || 'Webcam_1'
            : makeIdentifier(name) + suffix;
        devices.push({
          configName: name,
          type: mappedType,
          jsId,
          port: el.getAttribute('port'),
          // no real serials
        });
      }
    }
    for (const child of el.children || []) walk(child);
  };
  walk(doc.documentElement);

  const identifiers = {};
  const missingSimBindings = [];
  for (const d of devices) {
    identifiers[d.configName] = d.jsId;
    if (!supportedJs.has(d.jsId)) {
      // Webcam / IMU etc. — niet stilzwijgend negeren
      missingSimBindings.push(`${d.configName} (${d.type} → ${d.jsId})`);
    }
  }

  return { devices, identifiers, missingSimBindings };
}

function mapTagToType(tag, typeAttr) {
  const t = (typeAttr || tag || '').toLowerCase();
  if (t.includes('motor')) return 'DcMotorEx';
  if (t.includes('crservo') || t.includes('continuous')) return 'CRServo';
  if (t.includes('servo') && !t.includes('controller')) return 'Servo';
  if (t.includes('volt')) return 'VoltageSensor';
  if (t.includes('servocontroller')) return 'ServoController';
  if (t.includes('lynxmodule') || t.includes('revmodule')) return 'LynxModule';
  if (t.includes('imu') || t === 'imu') return 'IMU';
  if (t.includes('webcam')) return 'WebcamName';
  // Element names in FTC XML
  switch (tag) {
    case 'Motor':
    case 'DcMotor':
      return 'DcMotorEx';
    case 'Servo':
      return 'Servo';
    case 'ContinuousRotationServo':
    case 'CRServo':
      return 'CRServo';
    case 'LynxModule':
      return 'LynxModule';
    case 'ServoController':
      return 'ServoController';
    case 'IMU':
      return 'IMU';
    case 'Webcam':
      return 'WebcamName';
    default:
      return null;
  }
}

/** Synthetische fixture — geen echte serienummers. */
export const SYNTHETIC_HARDWARE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<Robot type="FirstInspires-FTC">
  <LynxUsbDevice name="Control Hub Portal" serialNumber="SYNTHETIC-PORTAL" parentModuleAddress="173">
    <LynxModule name="Control Hub" port="173">
      <Motor name="leftDrive" port="0" />
      <Motor name="rightDrive" port="1" />
      <Motor name="flywheel" port="2" />
      <Motor name="intakeMotor" port="3" />
      <Servo name="pollenServo" port="0" />
      <ContinuousRotationServo name="crServo" port="1" />
      <IMU name="imu" port="0" />
    </LynxModule>
  </LynxUsbDevice>
  <Webcam name="Webcam 1" />
</Robot>
`;
