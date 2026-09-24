/**
 * Command/sensor-uitwisseling tussen execution-worker en MuJoCo (main).
 * Commands: laatste waarde per jsId. Sensors: snapshot vanuit physics.
 */
export class CommandBus {
  constructor() {
    this.commands = new Map();
    this.sensors = Object.create(null);
    this._listeners = new Set();
  }

  publish(cmd) {
    this.commands.set(cmd.jsId, cmd);
    for (const fn of this._listeners) fn(cmd);
  }

  onCommand(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  getCommand(jsId) {
    return this.commands.get(jsId) || null;
  }

  allCommands() {
    return Object.fromEntries(this.commands);
  }

  setSensors(snapshot) {
    this.sensors = snapshot;
  }

  readSensor(jsId) {
    return (
      this.sensors[jsId] || {
        positionTicks: 0,
        velocityTicksPerSec: 0,
        busy: false,
      }
    );
  }

  zeroAllActuators() {
    for (const [jsId, cmd] of this.commands) {
      if (cmd.type === 'motor' || cmd.type === 'crServo') {
        this.commands.set(jsId, { ...cmd, power: 0, velocityTicksPerSec: 0, velocityMode: false });
      }
    }
  }

  clear() {
    this.commands.clear();
    this.sensors = Object.create(null);
  }
}
