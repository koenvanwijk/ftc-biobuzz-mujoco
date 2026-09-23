import {
  CELL_OPEN_D,
  CELL_OPEN_H,
  CELL_OPEN_W,
  CELL_SHELLS,
  EXTRA_NECTAR_PARK_Z,
  EXTRA_NECTAR_SPAWN,
  HIVE_PIVOT_Z,
  HIVE_TIP_JOINT_SIGN,
  HIVE_TIP_TRAVEL_DEG,
  HIVE_UPWARD_CELL,
  NECTAR_EXTRA_POOL,
  NECTAR_MAX_PER_ALLIANCE,
  NECTAR_R,
  NECTAR_STAGED_PER_ALLIANCE,
  TILE_THICKNESS,
  TIP_NECTAR_REQUIRED,
  TIP_POINTS,
  TIP_POLLEN_ALONE,
  TIP_POLLEN_WITH_NECTAR,
} from './constants.js';

function quatMul(q1, q2) {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

function quatRx(rad) {
  const half = 0.5 * rad;
  return [Math.cos(half), Math.sin(half), 0, 0];
}

function rotXMat(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function matMulVec(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

/**
 * Bi-stable HIVE tip both ways; each tip spawns +1 nectar up to 8 per alliance.
 * Tip animates about the pivot; free pieces inside either CELL are carried
 * rigidly so they stay captured (instant qpos teleport would spill out the back).
 */
export class HiveTipController {
  static COOLDOWN_S = 1.25;
  static ANIM_S = 0.4;
  static SETTLE_S = 0.2;

  constructor(mujoco, model, data) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.tipState = { red: 0, blue: 0 };
    this.extrasReleased = { red: 0, blue: 0 };
    this.tipCount = { red: 0, blue: 0 };
    this.score = { red: 0, blue: 0 };
    this.cooldownUntil = { red: 0, blue: 0 };
    this.lastEvent = '';
    this._tipAnim = { red: null, blue: null };
    this.pivot = [0, 0, TILE_THICKNESS + HIVE_PIVOT_Z];

    const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
    const JOINT = mujoco.mjtObj.mjOBJ_JOINT.value;

    this.jointQadr = {};
    this.jointDadr = {};
    this.shellBody = {};
    this.pollenIds = [];
    this.nectarIds = { red: [], blue: [] };
    this.extraIds = { red: [], blue: [] };
    this.extraQadr = { red: [], blue: [] };
    this.extraVadr = { red: [], blue: [] };
    this.bodyQadr = {};
    this.bodyVadr = {};

    for (const color of ['red', 'blue']) {
      const jid = mujoco.mj_name2id(model, JOINT, `hive_${color}_tip`);
      if (jid >= 0) {
        this.jointQadr[color] = model.jnt_qposadr[jid];
        this.jointDadr[color] = model.jnt_dofadr[jid];
      }
    }
    for (const key of Object.keys(CELL_SHELLS)) {
      const bid = mujoco.mj_name2id(model, BODY, `${key}_shell`);
      if (bid >= 0) this.shellBody[key] = bid;
    }
    for (let i = 0; i < model.nbody; i++) {
      const name = mujoco.mj_id2name(model, BODY, i);
      if (!name) continue;
      if (name.startsWith('pollen_')) this.pollenIds.push(i);
      else if (name.startsWith('nectar_red_') && !name.includes('extra')) this.nectarIds.red.push(i);
      else if (name.startsWith('nectar_blue_') && !name.includes('extra')) this.nectarIds.blue.push(i);
      else if (name.startsWith('nectar_extra_red_')) this.extraIds.red.push(i);
      else if (name.startsWith('nectar_extra_blue_')) this.extraIds.blue.push(i);
    }
    for (const color of ['red', 'blue']) {
      this.extraIds[color].sort((a, b) => {
        const na = mujoco.mj_id2name(model, BODY, a) || '';
        const nb = mujoco.mj_id2name(model, BODY, b) || '';
        return na.localeCompare(nb);
      });
      this.extraQadr[color] = [];
      this.extraVadr[color] = [];
      for (const bid of this.extraIds[color]) {
        const jnt = model.body_jntadr[bid];
        this.extraQadr[color].push(model.jnt_qposadr[jnt]);
        this.extraVadr[color].push(model.jnt_dofadr[jnt]);
      }
    }
    for (const bid of [
      ...this.pollenIds,
      ...this.nectarIds.red,
      ...this.nectarIds.blue,
      ...this.extraIds.red,
      ...this.extraIds.blue,
    ]) {
      const jnt = model.body_jntadr[bid];
      if (jnt < 0) continue;
      this.bodyQadr[bid] = model.jnt_qposadr[jnt];
      this.bodyVadr[bid] = model.jnt_dofadr[jnt];
    }
  }

  reset() {
    this.tipState = { red: 0, blue: 0 };
    this.extrasReleased = { red: 0, blue: 0 };
    this.tipCount = { red: 0, blue: 0 };
    this.score = { red: 0, blue: 0 };
    this.cooldownUntil = { red: 0, blue: 0 };
    this.lastEvent = '';
    this._tipAnim = { red: null, blue: null };
    for (const color of ['red', 'blue']) {
      if (this.jointQadr[color] != null) {
        this.data.qpos[this.jointQadr[color]] = 0;
        this.data.qvel[this.jointDadr[color]] = 0;
      }
      for (let i = 0; i < this.extraQadr[color].length; i++) this._parkExtra(color, i);
    }
  }

  update() {
    this._holdTipJoints();
    this._holdParkedExtras();
    const t = this.data.time;
    for (const color of ['red', 'blue']) {
      if (this.jointQadr[color] == null) continue;
      if (this._tipAnim[color] != null) continue;
      if (t < this.cooldownUntil[color]) continue;
      const [nNectar, nPollen] = this.countInUpwardCell(color);
      if (
        (nNectar >= TIP_NECTAR_REQUIRED && nPollen >= TIP_POLLEN_WITH_NECTAR) ||
        nPollen >= TIP_POLLEN_ALONE
      ) {
        this._doTip(color, nNectar, nPollen);
      }
    }
  }

  _tipTargetRad(color) {
    const sign = HIVE_TIP_JOINT_SIGN[color];
    if (this.tipState[color] === 0) return 0;
    return (sign * HIVE_TIP_TRAVEL_DEG * Math.PI) / 180;
  }

  _holdTipJoints() {
    const t = this.data.time;
    for (const color of ['red', 'blue']) {
      if (this.jointQadr[color] == null) continue;
      const anim = this._tipAnim[color];
      if (anim == null) {
        this.data.qpos[this.jointQadr[color]] = this._tipTargetRad(color);
        this.data.qvel[this.jointDadr[color]] = 0;
        continue;
      }
      const alpha = anim.duration > 0 ? (t - anim.startTime) / anim.duration : 1;
      if (alpha >= 1) {
        this._setJointAndPlaceCarry(color, anim, anim.qTo);
        if (t >= anim.holdUntil) this._tipAnim[color] = null;
      } else {
        const s = alpha * alpha * (3 - 2 * alpha);
        const q = anim.qFrom + s * (anim.qTo - anim.qFrom);
        this._setJointAndPlaceCarry(color, anim, q);
      }
    }
  }

  _setJointAndPlaceCarry(color, anim, q) {
    this.data.qpos[this.jointQadr[color]] = q;
    this.data.qvel[this.jointDadr[color]] = 0;
    const dq = q - anim.qFrom;
    const R = rotXMat(dq);
    const qRx = quatRx(dq);
    for (const [bidStr, snap] of Object.entries(anim.carry)) {
      const bid = Number(bidStr);
      const adr = this.bodyQadr[bid];
      const vadr = this.bodyVadr[bid];
      if (adr == null || vadr == null) continue;
      const pos = matMulVec(R, snap.rel);
      this.data.qpos[adr] = this.pivot[0] + pos[0];
      this.data.qpos[adr + 1] = this.pivot[1] + pos[1];
      this.data.qpos[adr + 2] = this.pivot[2] + pos[2];
      let quat = quatMul(qRx, snap.quat);
      const n = Math.hypot(quat[0], quat[1], quat[2], quat[3]);
      if (n > 1e-12) quat = quat.map((c) => c / n);
      this.data.qpos[adr + 3] = quat[0];
      this.data.qpos[adr + 4] = quat[1];
      this.data.qpos[adr + 5] = quat[2];
      this.data.qpos[adr + 6] = quat[3];
      for (let k = 0; k < 6; k++) this.data.qvel[vadr + k] = 0;
    }
  }

  _holdParkedExtras() {
    for (const color of ['red', 'blue']) {
      const nDone = this.extrasReleased[color];
      for (let i = nDone; i < this.extraQadr[color].length; i++) this._parkExtra(color, i);
    }
  }

  _hiveCellKeys(color) {
    return Object.keys(CELL_SHELLS).filter((k) => k.startsWith(`${color}_`));
  }

  _ballsInHiveCells(color) {
    const keys = this._hiveCellKeys(color);
    const candidates = [
      ...this.nectarIds[color],
      ...this.pollenIds,
      ...this.extraIds[color].slice(0, this.extrasReleased[color]),
    ];
    const out = [];
    const seen = new Set();
    for (const bid of candidates) {
      if (seen.has(bid)) continue;
      if (keys.some((key) => this._inCell(bid, key, -0.01))) {
        out.push(bid);
        seen.add(bid);
      }
    }
    return out;
  }

  countInUpwardCell(color) {
    const cellKey = HIVE_UPWARD_CELL[color][this.tipState[color]];
    let nNectar = 0;
    for (const bid of this.nectarIds[color]) {
      if (this._inCell(bid, cellKey)) nNectar++;
    }
    let nPollen = 0;
    for (const bid of this.pollenIds) {
      if (this._inCell(bid, cellKey)) nPollen++;
    }
    return [nNectar, nPollen];
  }

  _inCell(bid, cellKey, margin = 0.02) {
    const shellId = this.shellBody[cellKey];
    if (shellId == null) return false;
    const sOpen = CELL_SHELLS[cellKey].open_sign;
    const ox = this.data.xpos[shellId * 3];
    const oy = this.data.xpos[shellId * 3 + 1];
    const oz = this.data.xpos[shellId * 3 + 2];
    const b = shellId * 9;
    const R = this.data.xmat;
    const px = this.data.xpos[bid * 3] - ox;
    const py = this.data.xpos[bid * 3 + 1] - oy;
    const pz = this.data.xpos[bid * 3 + 2] - oz;
    const lx = R[b] * px + R[b + 3] * py + R[b + 6] * pz;
    const ly = R[b + 1] * px + R[b + 4] * py + R[b + 7] * pz;
    const lz = R[b + 2] * px + R[b + 5] * py + R[b + 8] * pz;
    const w = CELL_OPEN_W / 2 - margin;
    const h = CELL_OPEN_H / 2 - margin;
    const d = CELL_OPEN_D / 2;
    if (Math.abs(lx) > w || Math.abs(lz) > h) return false;
    const yOpen = sOpen * d;
    const yBack = -sOpen * d;
    const yLo = Math.min(yBack, yOpen) + margin;
    const yHi = Math.max(yBack, yOpen) - margin;
    return ly >= yLo && ly <= yHi;
  }

  _doTip(color, nNectar, nPollen) {
    const prev = this.tipState[color];
    const qFrom = this.data.qpos[this.jointQadr[color]];
    this.tipState[color] = 1 - prev;
    const qTo = this._tipTargetRad(color);
    const carry = {};
    for (const bid of this._ballsInHiveCells(color)) {
      const adr = this.bodyQadr[bid];
      if (adr == null) continue;
      carry[bid] = {
        rel: [
          this.data.qpos[adr] - this.pivot[0],
          this.data.qpos[adr + 1] - this.pivot[1],
          this.data.qpos[adr + 2] - this.pivot[2],
        ],
        quat: [
          this.data.qpos[adr + 3],
          this.data.qpos[adr + 4],
          this.data.qpos[adr + 5],
          this.data.qpos[adr + 6],
        ],
      };
    }
    const t = this.data.time;
    this._tipAnim[color] = {
      startTime: t,
      duration: HiveTipController.ANIM_S,
      qFrom,
      qTo,
      carry,
      holdUntil: t + HiveTipController.ANIM_S + HiveTipController.SETTLE_S,
    };
    this.cooldownUntil[color] =
      t + HiveTipController.COOLDOWN_S + HiveTipController.ANIM_S + HiveTipController.SETTLE_S;
    this.tipCount[color] += 1;
    this.score[color] += TIP_POINTS;
    const spawned = this._releaseExtra(color);
    const direction = this.tipState[color] === 1 ? 'TIP' : 'TIP BACK';
    const total = NECTAR_STAGED_PER_ALLIANCE + this.extrasReleased[color];
    const extraMsg = spawned
      ? `; +1 ${color} nectar (${total}/${NECTAR_MAX_PER_ALLIANCE})`
      : `; nectar cap ${NECTAR_MAX_PER_ALLIANCE}`;
    this.lastEvent = `HIVE ${color.toUpperCase()} ${direction} +${TIP_POINTS} (score ${this.score[color]}) — nectar=${nNectar} pollen=${nPollen}${extraMsg}`;
    this._holdTipJoints();
    this.mujoco.mj_forward(this.model, this.data);
  }

  _parkExtra(color, index) {
    const adr = this.extraQadr[color][index];
    const x = (color === 'blue' ? 0.15 : -0.15) + index * 0.02;
    this.data.qpos[adr] = x;
    this.data.qpos[adr + 1] = 0;
    this.data.qpos[adr + 2] = EXTRA_NECTAR_PARK_Z;
    this.data.qpos[adr + 3] = 1;
    this.data.qpos[adr + 4] = 0;
    this.data.qpos[adr + 5] = 0;
    this.data.qpos[adr + 6] = 0;
    const vadr = this.extraVadr[color][index];
    for (let k = 0; k < 6; k++) this.data.qvel[vadr + k] = 0;
  }

  _releaseExtra(color) {
    const idx = this.extrasReleased[color];
    const pool = this.extraQadr[color];
    if (idx >= pool.length || idx >= NECTAR_EXTRA_POOL) return false;
    let [sx, sy, sz] = EXTRA_NECTAR_SPAWN[color];
    sx += (color === 'blue' ? 0.05 : -0.05) * (idx % 3);
    sy += 0.04 * (Math.floor(idx / 3) % 3);
    sz = Math.max(sz, TILE_THICKNESS + NECTAR_R + 0.002);
    const adr = pool[idx];
    this.data.qpos[adr] = sx;
    this.data.qpos[adr + 1] = sy;
    this.data.qpos[adr + 2] = sz;
    this.data.qpos[adr + 3] = 1;
    this.data.qpos[adr + 4] = 0;
    this.data.qpos[adr + 5] = 0;
    this.data.qpos[adr + 6] = 0;
    const vadr = this.extraVadr[color][idx];
    for (let k = 0; k < 6; k++) this.data.qvel[vadr + k] = 0;
    this.extrasReleased[color] = idx + 1;
    return true;
  }
}
