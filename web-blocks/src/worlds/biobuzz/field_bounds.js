import { HALF, TILE_THICKNESS, POLLEN_R, NECTAR_R } from './constants.js';

const MARGIN = 0.02;
const Z_MIN = -0.05;
const Z_MAX = 2.8;
const PARK_Z_THRESH = 2.5;

/**
 * Reintroduce free POLLEN/NECTAR that leave the FIELD (§10.8.2).
 * Skips hopper-held pollen and parked extra nectar (z > 2.5).
 */
export class FieldBoundsReturn {
  constructor(mujoco, model, data) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.bodies = [];
    this.qposAdr = new Map();
    this.qvelAdr = new Map();
    this.protected = new Set();
    this.lastReturns = 0;

    const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
    for (let i = 0; i < model.nbody; i++) {
      const name = mujoco.mj_id2name(model, BODY, i);
      if (!name) continue;
      let r = null;
      if (name.startsWith('pollen_')) r = POLLEN_R;
      else if (name.startsWith('nectar_') && !name.includes('intake')) r = NECTAR_R;
      else continue;
      const jnt = model.body_jntadr[i];
      if (jnt < 0) continue;
      this.bodies.push({ bid: i, r });
      this.qposAdr.set(i, model.jnt_qposadr[jnt]);
      this.qvelAdr.set(i, model.jnt_dofadr[jnt]);
    }
  }

  setProtected(bodyIds) {
    this.protected = new Set(bodyIds || []);
  }

  update() {
    const half = HALF - MARGIN;
    const zTile = TILE_THICKNESS;
    let n = 0;
    const xpos = this.data.xpos;
    const qpos = this.data.qpos;
    const qvel = this.data.qvel;
    for (const { bid, r } of this.bodies) {
      if (this.protected.has(bid)) continue;
      const o = bid * 3;
      let x = xpos[o];
      let y = xpos[o + 1];
      let z = xpos[o + 2];
      if (z >= PARK_Z_THRESH) continue;
      const out =
        Math.abs(x) > half || Math.abs(y) > half || z < Z_MIN || z > Z_MAX;
      if (!out) continue;
      let nx = Math.max(-half, Math.min(half, x));
      let ny = Math.max(-half, Math.min(half, y));
      if (Math.abs(x) > half) nx = Math.sign(x) * (half - r - 0.01);
      if (Math.abs(y) > half) ny = Math.sign(y) * (half - r - 0.01);
      const nz = zTile + r + 0.002;
      const adr = this.qposAdr.get(bid);
      qpos[adr] = nx;
      qpos[adr + 1] = ny;
      qpos[adr + 2] = nz;
      qpos[adr + 3] = 1;
      qpos[adr + 4] = 0;
      qpos[adr + 5] = 0;
      qpos[adr + 6] = 0;
      const vadr = this.qvelAdr.get(bid);
      for (let k = 0; k < 6; k++) qvel[vadr + k] = 0;
      n += 1;
    }
    this.lastReturns = n;
    return n;
  }
}
