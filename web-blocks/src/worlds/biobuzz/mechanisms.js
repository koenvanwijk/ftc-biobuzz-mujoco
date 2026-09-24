import {
  DRIVE_LINEAR_ACCEL,
  FLOWER_CAD_XY,
  FLOWER_COLLAR_INNER_R,
  FLOWER_PLANT_CAPACITY,
  FLOWER_PLACE_RANGE,
  FLOWER_POLLEN_CAPACITY,
  HOPPER_CAPACITY,
  HOPPER_LOCAL_SLOTS,
  INTAKE_CAPTURE_R,
  MAX_LINEAR_VEL,
  MAX_WHEEL_VEL,
  MAX_YAW_CMD,
  NECTAR_HOPPER_CAPACITY,
  NECTAR_HOPPER_LOCAL_SLOTS,
  NECTAR_INTAKE_CAPTURE_R,
  NECTAR_R,
  POLLEN_DIA,
  POLLEN_R,
  PRELOAD_SLICE,
  SHOOT_ELEVATION_DEG,
  SHOOT_SPEED,
  TILE_THICKNESS,
  TRACK_WIDTH,
  FLOWER_FLOOR_H,
  WHEEL_R,
} from './constants.js';

/**
 * Front pollen hopper + rear mixed FIFO + arc shooter + flower place.
 * E / bumper: intake both. Hold C / left bumper reverse: FIFO spit rear.
 * X: FIFO rear → flower stack (or drop).
 */
export class IntakeShooter {
  constructor(mujoco, model, data) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.stored = []; // front / shooter: pollen only
    this.rearStored = []; // rear FIFO: nectar OR pollen
    this.planted = new Set(); // nectar+pollen in flower cups
    this.plantPose = new Map(); // bid -> [fx, fy, z]
    this.intakePower = 0;
    this.shootQueued = false;
    this._revCooldown = 0;
    this.flowerXy = FLOWER_CAD_XY.map(([x, y]) => [x, y]);

    const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
    const SITE = mujoco.mjtObj.mjOBJ_SITE.value;

    this.pollenBodyIds = [];
    this.nectarBodyIds = [];
    for (let i = 0; i < model.nbody; i++) {
      const name = mujoco.mj_id2name(model, BODY, i);
      if (!name) continue;
      if (name.startsWith('pollen_')) this.pollenBodyIds.push(i);
      else if (
        name.startsWith('nectar_') &&
        !name.includes('intake') &&
        model.body_jntadr[i] >= 0
      ) {
        this.nectarBodyIds.push(i);
      }
    }
    this.nectarIdSet = new Set(this.nectarBodyIds);
    this.pollenIdSet = new Set(this.pollenBodyIds);

    this.robotId = mujoco.mj_name2id(model, BODY, 'robot');
    this.intakeSite = mujoco.mj_name2id(model, SITE, 'intake_site');
    this.nectarIntakeSite = mujoco.mj_name2id(model, SITE, 'nectar_intake_site');
    this.muzzleSite = mujoco.mj_name2id(model, SITE, 'shooter_muzzle');

    this.qposAdr = new Map();
    this.qvelAdr = new Map();
    for (const bid of [...this.pollenBodyIds, ...this.nectarBodyIds]) {
      const jnt = model.body_jntadr[bid];
      this.qposAdr.set(bid, model.jnt_qposadr[jnt]);
      this.qvelAdr.set(bid, model.jnt_dofadr[jnt]);
    }
  }

  get count() {
    return this.stored.length;
  }

  get nectarCount() {
    return this.rearStored.length;
  }

  get rearCount() {
    return this.rearStored.length;
  }

  protectedBodyIds() {
    return [...this.stored, ...this.rearStored, ...this.planted];
  }

  resetAndPreload() {
    this.stored = [];
    this.rearStored = [];
    this.planted = new Set();
    this.plantPose = new Map();
    this.intakePower = 0;
    this.shootQueued = false;
    this._revCooldown = 0;
    const BODY = this.mujoco.mjtObj.mjOBJ_BODY.value;
    const byName = new Map();
    for (const bid of this.pollenBodyIds) {
      byName.set(this.mujoco.mj_id2name(this.model, BODY, bid), bid);
    }
    for (let i = PRELOAD_SLICE[0]; i < PRELOAD_SLICE[1]; i++) {
      const bid = byName.get(`pollen_${String(i).padStart(2, '0')}`);
      if (bid != null) this._stowPollen(bid);
    }
  }

  setIntakePower(power) {
    this.intakePower = Math.max(-1, Math.min(1, power));
  }

  fire() {
    if (!this.stored.length) return false;
    this.shootQueued = true;
    return true;
  }

  update() {
    const p = this.intakePower;
    if (p > 0.05) {
      this._tryCapturePollenFront();
      this._tryCaptureNectarRear();
      this._tryCapturePollenRear();
    } else if (p < -0.05) {
      this._reverseEjectRear();
    }
    this._holdStored();
    this._holdPlanted();
    if (this.shootQueued) {
      this.shootQueued = false;
      this._ejectOnePollen();
    }
  }

  _sitePos(siteId) {
    const s = this.data.site_xpos;
    const i = siteId * 3;
    return [s[i], s[i + 1], s[i + 2]];
  }

  _intakePos() {
    return this._sitePos(this.intakeSite);
  }

  _nectarIntakePos() {
    if (this.nectarIntakeSite < 0) return this._intakePos();
    return this._sitePos(this.nectarIntakeSite);
  }

  _muzzlePos() {
    return this._sitePos(this.muzzleSite);
  }

  _robotXAxis() {
    const R = this.data.xmat;
    const b = this.robotId * 9;
    return [R[b], R[b + 3], R[b + 6]];
  }

  _robotXy() {
    const o = this.robotId * 3;
    return [this.data.xpos[o], this.data.xpos[o + 1]];
  }

  _ballKind(bid) {
    return this.nectarIdSet.has(bid) ? 'nectar' : 'pollen';
  }

  _ballRadius(bid) {
    return this.nectarIdSet.has(bid) ? NECTAR_R : POLLEN_R;
  }

  _tryCapturePollenFront() {
    if (this.stored.length >= HOPPER_CAPACITY) return;
    const center = this._intakePos();
    const r2 = INTAKE_CAPTURE_R * INTAKE_CAPTURE_R;
    const busy = new Set([...this.stored, ...this.rearStored, ...this.planted]);
    for (const bid of this.pollenBodyIds) {
      if (busy.has(bid)) continue;
      const p = this.data.xpos;
      const i = bid * 3;
      const dx = p[i] - center[0];
      const dy = p[i + 1] - center[1];
      const dz = p[i + 2] - center[2];
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this._stowPollen(bid);
        busy.add(bid);
        if (this.stored.length >= HOPPER_CAPACITY) break;
      }
    }
  }

  _tryCapturePollenRear() {
    if (this.nectarIntakeSite < 0) return;
    if (this.rearStored.length >= NECTAR_HOPPER_CAPACITY) return;
    const center = this._nectarIntakePos();
    const r2 = NECTAR_INTAKE_CAPTURE_R * NECTAR_INTAKE_CAPTURE_R;
    const busy = new Set([...this.stored, ...this.rearStored, ...this.planted]);
    for (const bid of this.pollenBodyIds) {
      if (busy.has(bid)) continue;
      const p = this.data.xpos;
      const i = bid * 3;
      const dx = p[i] - center[0];
      const dy = p[i + 1] - center[1];
      const dz = p[i + 2] - center[2];
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this._stowRear(bid);
        busy.add(bid);
        if (this.rearStored.length >= NECTAR_HOPPER_CAPACITY) break;
      }
    }
  }

  _tryCaptureNectarRear() {
    if (this.nectarIntakeSite < 0) return;
    if (this.rearStored.length >= NECTAR_HOPPER_CAPACITY) return;
    const center = this._nectarIntakePos();
    const r2 = NECTAR_INTAKE_CAPTURE_R * NECTAR_INTAKE_CAPTURE_R;
    for (const bid of this.nectarBodyIds) {
      if (this.rearStored.includes(bid) || this.planted.has(bid)) continue;
      const p = this.data.xpos;
      const i = bid * 3;
      if (p[i + 2] > 2.5) continue;
      const dx = p[i] - center[0];
      const dy = p[i + 1] - center[1];
      const dz = p[i + 2] - center[2];
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this._stowRear(bid);
        if (this.rearStored.length >= NECTAR_HOPPER_CAPACITY) break;
      }
    }
  }

  _stowPollen(bid) {
    if (this.stored.includes(bid) || this.stored.length >= HOPPER_CAPACITY) return;
    const ri = this.rearStored.indexOf(bid);
    if (ri >= 0) this.rearStored.splice(ri, 1);
    this.planted.delete(bid);
    this.plantPose.delete(bid);
    this.stored.push(bid);
    this._placeLocal(bid, HOPPER_LOCAL_SLOTS[(this.stored.length - 1) % HOPPER_LOCAL_SLOTS.length]);
  }

  _stowRear(bid) {
    if (this.rearStored.includes(bid) || this.rearStored.length >= NECTAR_HOPPER_CAPACITY) return;
    const si = this.stored.indexOf(bid);
    if (si >= 0) this.stored.splice(si, 1);
    this.planted.delete(bid);
    this.plantPose.delete(bid);
    this.rearStored.push(bid);
    this._placeLocal(
      bid,
      NECTAR_HOPPER_LOCAL_SLOTS[(this.rearStored.length - 1) % NECTAR_HOPPER_LOCAL_SLOTS.length],
    );
  }

  _placeLocal(bid, local) {
    const R = this.data.xmat;
    const b = this.robotId * 9;
    const origin = this.data.xpos;
    const o = this.robotId * 3;
    const world = [
      origin[o] + R[b] * local[0] + R[b + 1] * local[1] + R[b + 2] * local[2],
      origin[o + 1] + R[b + 3] * local[0] + R[b + 4] * local[1] + R[b + 5] * local[2],
      origin[o + 2] + R[b + 6] * local[0] + R[b + 7] * local[1] + R[b + 8] * local[2],
    ];
    this._setFreePose(bid, world, null);
  }

  _setFreePose(bid, xyz, vel) {
    const adr = this.qposAdr.get(bid);
    this.data.qpos[adr] = xyz[0];
    this.data.qpos[adr + 1] = xyz[1];
    this.data.qpos[adr + 2] = xyz[2];
    this.data.qpos[adr + 3] = 1;
    this.data.qpos[adr + 4] = 0;
    this.data.qpos[adr + 5] = 0;
    this.data.qpos[adr + 6] = 0;
    const vadr = this.qvelAdr.get(bid);
    if (!vel) {
      for (let k = 0; k < 6; k++) this.data.qvel[vadr + k] = 0;
    } else {
      this.data.qvel[vadr] = vel[0];
      this.data.qvel[vadr + 1] = vel[1];
      this.data.qvel[vadr + 2] = vel[2];
      this.data.qvel[vadr + 3] = 0;
      this.data.qvel[vadr + 4] = 0;
      this.data.qvel[vadr + 5] = 0;
    }
  }

  _holdStored() {
    for (let i = 0; i < this.stored.length; i++) {
      this._placeLocal(this.stored[i], HOPPER_LOCAL_SLOTS[i % HOPPER_LOCAL_SLOTS.length]);
    }
    for (let i = 0; i < this.rearStored.length; i++) {
      this._placeLocal(
        this.rearStored[i],
        NECTAR_HOPPER_LOCAL_SLOTS[i % NECTAR_HOPPER_LOCAL_SLOTS.length],
      );
    }
  }

  _nearestFlower() {
    const [rx, ry] = this._robotXy();
    let bestI = 0;
    let bestD = 1e9;
    let bestFx = this.flowerXy[0][0];
    let bestFy = this.flowerXy[0][1];
    for (let i = 0; i < this.flowerXy.length; i++) {
      const [fx, fy] = this.flowerXy[i];
      const d = Math.hypot(rx - fx, ry - fy);
      if (d < bestD) {
        bestD = d;
        bestI = i;
        bestFx = fx;
        bestFy = fy;
      }
    }
    return { i: bestI, fx: bestFx, fy: bestFy, dist: bestD };
  }

  _nectarInFlower(fx, fy) {
    const r2 = (FLOWER_COLLAR_INNER_R + NECTAR_R) ** 2;
    const out = [];
    for (const bid of this.nectarBodyIds) {
      if (this.rearStored.includes(bid)) continue;
      const p = this.data.xpos;
      const i = bid * 3;
      if (p[i + 2] > 2.5) continue;
      const dx = p[i] - fx;
      const dy = p[i + 1] - fy;
      if (dx * dx + dy * dy <= r2 && p[i + 2] < 0.35) out.push(bid);
    }
    return out;
  }

  _pollenInFlower(fx, fy) {
    const r2 = (FLOWER_COLLAR_INNER_R + POLLEN_R) ** 2;
    const out = [];
    const held = new Set([...this.stored, ...this.rearStored]);
    for (const bid of this.pollenBodyIds) {
      if (held.has(bid)) continue;
      const p = this.data.xpos;
      const i = bid * 3;
      const dx = p[i] - fx;
      const dy = p[i + 1] - fy;
      if (dx * dx + dy * dy <= r2 && p[i + 2] > 0 && p[i + 2] < 0.45) out.push(bid);
    }
    return out;
  }

  _holdPlanted() {
    for (const [bid, pose] of this.plantPose) {
      if (!this.planted.has(bid)) {
        this.plantPose.delete(bid);
        continue;
      }
      this._setFreePose(bid, pose, null);
    }
  }

  _plantedInFlower(fx, fy) {
    const out = [];
    for (const [bid, pose] of this.plantPose) {
      if (!this.planted.has(bid)) continue;
      const dx = pose[0] - fx;
      const dy = pose[1] - fy;
      if (dx * dx + dy * dy < 1e-6) out.push([pose[2], bid]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.map(([, bid]) => bid);
  }

  _stackCenterZs(bids) {
    const zs = [];
    const floor = TILE_THICKNESS + FLOWER_FLOOR_H + 0.001;
    let prevR = 0;
    let z = floor;
    for (let i = 0; i < bids.length; i++) {
      const r = this._ballRadius(bids[i]);
      if (i === 0) z = floor + r;
      else z = z + prevR * 0.92 + r * 0.92;
      zs.push(z);
      prevR = r;
    }
    return zs;
  }

  _applyStackPoses(fx, fy, bids) {
    const zs = this._stackCenterZs(bids);
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      const z = zs[i];
      this.plantPose.set(bid, [fx, fy, z]);
      this._setFreePose(bid, [fx, fy, z], null);
    }
  }

  /**
   * FIFO from rear into nearest flower if in range; else drop on field.
   * @returns {string} placed_nectar|placed_pollen|dropped_*|full|empty
   */
  tryPlaceNectar() {
    if (!this.rearStored.length) return 'empty';
    const { fx, fy, dist } = this._nearestFlower();
    const kind = this._ballKind(this.rearStored[0]);
    if (dist <= FLOWER_PLACE_RANGE) {
      const already = this._plantedInFlower(fx, fy);
      if (already.length >= FLOWER_PLANT_CAPACITY) return 'full';
      const bid = this.rearStored.shift();
      for (let i = 0; i < this.rearStored.length; i++) {
        this._placeLocal(
          this.rearStored[i],
          NECTAR_HOPPER_LOCAL_SLOTS[i % NECTAR_HOPPER_LOCAL_SLOTS.length],
        );
      }
      const stack = [...already, bid];
      this.planted.add(bid);
      this._applyStackPoses(fx, fy, stack);
      return `placed_${kind}`;
    }
    const bid = this.rearStored.shift();
    for (let i = 0; i < this.rearStored.length; i++) {
      this._placeLocal(
        this.rearStored[i],
        NECTAR_HOPPER_LOCAL_SLOTS[i % NECTAR_HOPPER_LOCAL_SLOTS.length],
      );
    }
    const rear = this._nectarIntakePos();
    let [fxR, fyR] = this._robotXAxis();
    const nxy = Math.hypot(fxR, fyR) || 1e-9;
    fxR /= nxy;
    fyR /= nxy;
    const bx = -fxR;
    const by = -fyR;
    const r = this._ballRadius(bid);
    const drop = [
      rear[0] + bx * 0.12,
      rear[1] + by * 0.12,
      Math.max(rear[2], TILE_THICKNESS + r + 0.02),
    ];
    this._setFreePose(bid, drop, [bx * 0.9, by * 0.9, 0]);
    this.planted.delete(bid);
    this.plantPose.delete(bid);
    return `dropped_${kind}`;
  }

  _reverseEjectRear() {
    if (!this.rearStored.length) return;
    if (this.data.time < this._revCooldown) return;
    this._revCooldown = this.data.time + 0.35;
    const bid = this.rearStored.shift();
    const rear = this._nectarIntakePos();
    let [fx, fy] = this._robotXAxis();
    const nxy = Math.hypot(fx, fy) || 1e-9;
    fx /= nxy;
    fy /= nxy;
    const bx = -fx;
    const by = -fy;
    this._setFreePose(bid, [rear[0] + bx * 0.08, rear[1] + by * 0.08, rear[2]], [
      bx * 1.2,
      by * 1.2,
      0,
    ]);
    this.planted.delete(bid);
    this.plantPose.delete(bid);
    for (let i = 0; i < this.rearStored.length; i++) {
      this._placeLocal(
        this.rearStored[i],
        NECTAR_HOPPER_LOCAL_SLOTS[i % NECTAR_HOPPER_LOCAL_SLOTS.length],
      );
    }
  }

  _ejectOnePollen() {
    if (!this.stored.length) return;
    const bid = this.stored.shift();
    const muzzle = this._muzzlePos();
    const elev = (SHOOT_ELEVATION_DEG * Math.PI) / 180;
    let [fx, fy] = this._robotXAxis();
    const nxy = Math.hypot(fx, fy) || 1e-9;
    fx /= nxy;
    fy /= nxy;
    let dx = fx * Math.cos(elev);
    let dy = fy * Math.cos(elev);
    let dz = Math.sin(elev);
    const n = Math.hypot(dx, dy, dz) || 1e-9;
    dx /= n;
    dy /= n;
    dz /= n;
    this._setFreePose(bid, muzzle, [dx * SHOOT_SPEED, dy * SHOOT_SPEED, dz * SHOOT_SPEED]);
  }
}

/** Stateful tank-drive: stick → clamped linear targets; slew each physics dt. */
let _driveTgtL = 0;
let _driveTgtR = 0;
let _driveCmdL = 0;
let _driveCmdR = 0;

export function resetDriveState() {
  _driveTgtL = _driveTgtR = 0;
  _driveCmdL = _driveCmdR = 0;
}

function clampTankLinear(vL, vR) {
  const vAvg = 0.5 * (vL + vR);
  const yaw = (vR - vL) / TRACK_WIDTH;
  let scale = 1.0;
  if (Math.abs(vAvg) > MAX_LINEAR_VEL && Math.abs(vAvg) > 1e-12) {
    scale = Math.min(scale, MAX_LINEAR_VEL / Math.abs(vAvg));
  }
  if (Math.abs(yaw) > MAX_YAW_CMD && Math.abs(yaw) > 1e-12) {
    scale = Math.min(scale, MAX_YAW_CMD / Math.abs(yaw));
  }
  return [vL * scale, vR * scale];
}

/** Map stick [-1,1] → clamped wheel rad/s targets (slew via updateDriveSlew). */
export function setTankPower(data, left, right) {
  left = Math.max(-1, Math.min(1, left));
  right = Math.max(-1, Math.min(1, right));
  const [vL, vR] = clampTankLinear(left * MAX_LINEAR_VEL, right * MAX_LINEAR_VEL);
  _driveTgtL = vL / WHEEL_R;
  _driveTgtR = vR / WHEEL_R;
  // Keep ctrl coherent if caller never slews (best-effort write of last cmd).
  if (data && data.ctrl) {
    data.ctrl[0] = _driveCmdL;
    data.ctrl[1] = _driveCmdR;
  }
}

/** Slew commanded wheel rad/s toward targets using DRIVE_LINEAR_ACCEL. */
export function updateDriveSlew(data, dt) {
  const maxDw = (DRIVE_LINEAR_ACCEL / WHEEL_R) * Math.max(0, dt);
  const stepToward = (cmd, tgt) => {
    const d = tgt - cmd;
    if (Math.abs(d) <= maxDw) return tgt;
    return cmd + (d > 0 ? maxDw : -maxDw);
  };
  _driveCmdL = Math.max(-MAX_WHEEL_VEL, Math.min(MAX_WHEEL_VEL, stepToward(_driveCmdL, _driveTgtL)));
  _driveCmdR = Math.max(-MAX_WHEEL_VEL, Math.min(MAX_WHEEL_VEL, stepToward(_driveCmdR, _driveTgtR)));
  data.ctrl[0] = _driveCmdL;
  data.ctrl[1] = _driveCmdR;
}
