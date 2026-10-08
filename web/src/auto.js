import { MAX_LINEAR_VEL, MAX_YAW_RATE, TRACK_WIDTH } from './constants.js';
import { setTankPower } from './mechanisms.js';

/**
 * Short LeaveAndGarden-style autonomous sequence.
 * Uses wall-clock sleep while the main loop continues stepping physics.
 */
export class AutoRunner {
  constructor({ getModel, getData, getMech, onTelemetry }) {
    this.getModel = getModel;
    this.getData = getData;
    this.getMech = getMech;
    this.onTelemetry = onTelemetry || (() => {});
    this.running = false;
    this._abort = false;
  }

  get active() {
    return this.running;
  }

  abort() {
    this._abort = true;
  }

  async runLeaveAndGarden() {
    if (this.running) return;
    this.running = true;
    this._abort = false;
    const drive = {
      setPower: (l, r) => setTankPower(this.getData(), l, r),
      stop: () => setTankPower(this.getData(), 0, 0),
      forward: async (seconds, power = 0.5) => {
        drive.setPower(power, power);
        await this.sleep(seconds * 1000);
        drive.stop();
      },
      turn: async (degrees, power = 0.4) => {
        const v = Math.abs(power) * MAX_LINEAR_VEL;
        const omega = Math.min((2 * v) / TRACK_WIDTH, MAX_YAW_RATE);
        if (omega < 1e-6) return;
        const seconds = (Math.abs(degrees) * Math.PI) / 180 / omega;
        const direction = degrees >= 0 ? 1 : -1;
        drive.setPower(-direction * Math.abs(power), direction * Math.abs(power));
        await this.sleep(seconds * 1000);
        drive.stop();
      },
    };

    try {
      // Start (G304): TILE A6 tegen de rode muur (−X), neus +X. Rode GARDEN = A1 tegen de
      // publieksmuur (−Y), het andere eind van de rode muur (manual Fig. 9-2).
      this.onTelemetry('LEAVE: vooruit van de muur');
      drive.setPower(0.35, 0.35);
      await this.sleep(400);
      drive.stop();

      await drive.forward(0.4, 0.45);

      // turn() is tijd-gebaseerd en draait in MuJoCo minder dan opgegeven: −175 ≈ kwartslag rechtsom.
      this.onTelemetry('Draai rechtsom richting rode GARDEN (publiekszijde)');
      await drive.turn(-175, 0.35);

      this.onTelemetry('Rijd langs de rode muur naar de GARDEN');
      await drive.forward(6.2, 0.4);

      drive.stop();
      this.onTelemetry('Auto klaar: vóór de rode GARDEN');
    } finally {
      setTankPower(this.getData(), 0, 0);
      this.running = false;
      this._abort = false;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (this._abort || performance.now() - t0 >= ms) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
}
