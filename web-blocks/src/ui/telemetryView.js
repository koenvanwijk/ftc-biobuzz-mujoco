export function composeTelemetry(opModeText = '', mechanismText = '') {
  const opMode = String(opModeText || '');
  const mechanism = String(mechanismText || '');
  if (!opMode) return mechanism;
  if (!mechanism) return opMode;
  return `${opMode}\n---\n${mechanism}`;
}
