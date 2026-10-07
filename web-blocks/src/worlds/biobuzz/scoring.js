/**
 * BIOBUZZ-score volgens Competition Manual TU03 §10.5 / Table 10-2 / Table 10-3 — ZONDER wedstrijdklok.
 *
 * - HIVE TIP (20): live, uit HiveTipController.tipCount.
 * - POLLEN/NECTAR in de omhoog-CELL (2), in een FLOWER met eigenaar (2), onderste-NECTAR-bonus (5),
 *   GARDEN (1): uit de huidige veldtoestand; alleen elementen die stil liggen (|v| < REST_SPEED) en
 *   die geen robot vasthoudt tellen ("when at rest", §10.5 D/E). Dit is dus "als de wedstrijd nu
 *   zou eindigen".
 * - LEAVE (3): indicatief — vergrendeld zodra de robot de muur niet meer raakt (§10.5.4), ongeacht
 *   het moment (zonder klok weten we niet of dat in AUTO was).
 * - PARK (5): indicatief — "als nu geparkeerd": robot nu (deels) in de eigen LOADING ZONE. Alleen de
 *   TELEOP-PARK telt; AUTO PARK (+5) vraagt het einde van AUTO en dus een klok.
 * - RP: SWARM (LEAVE + PARK ≥ 16), POLLINATOR 1/2 (≥ 4 / ≥ 7 TIPS); WIN/TIE niet (geen wedstrijdeinde).
 * - Fouten/penalty's (§10.6–10.8) worden niet gescoord.
 */
import {
  FIELD_SIZE,
  FLOWER_CAD_XY,
  FLOWER_SCORE_R,
  FLOWER_SCORE_Z_MAX,
  FLOWER_SCORE_Z_MIN,
  NECTAR_R,
  POLLEN_R,
  TILE_THICKNESS,
  TIP_POINTS,
} from './constants.js';

/** Puntwaarden (Table 10-2). */
export const SCORE_POINTS = Object.freeze({
  LEAVE: 3,
  PARK_AUTO: 5,
  PARK_TELEOP: 5,
  TIP: TIP_POINTS,
  CELL: 2,
  FLOWER_OWNED: 2,
  BOTTOM_NECTAR: 5,
  GARDEN: 1,
});

/** RP-drempels "All Other Events" (Table 10-3). */
export const RP_THRESHOLDS = Object.freeze({ SWARM: 16, POLLINATOR_1: 4, POLLINATOR_2: 7 });

/** Element telt als "in rust" onder deze snelheid (m/s). */
export const REST_SPEED = 0.05;
/** LEAVE: robot (bumper) minstens zo ver van elke perimeter-muur (m) = raakt de muur niet meer. */
export const LEAVE_WALL_CLEARANCE = 0.03;

const HALF = FIELD_SIZE / 2;
const ALLIANCES = ['red', 'blue'];

/**
 * Eén FLOWER: eigenaar = kleur van de bovenste scorende NECTAR, bonus = kleur van de onderste.
 * @param {{kind:'pollen'|'nectar', color?:'red'|'blue', z:number}[]} elems  scorende elementen
 * @returns {{owner:string|null, bottom:string|null, count:number}}
 */
export function scoreFlower(elems) {
  const nectar = elems.filter((e) => e.kind === 'nectar' && (e.color === 'red' || e.color === 'blue'));
  if (!nectar.length) return { owner: null, bottom: null, count: elems.length };
  let top = nectar[0];
  let low = nectar[0];
  for (const e of nectar) {
    if (e.z > top.z) top = e;
    if (e.z < low.z) low = e;
  }
  return { owner: top.color, bottom: low.color, count: elems.length };
}

/**
 * Pure score-berekening uit een veld-snapshot.
 * @param {{
 *   tips: {red:number, blue:number},
 *   cell: {red:number, blue:number},
 *   flowers: {kind:string, color?:string, z:number}[][],
 *   garden: {red:number, blue:number},
 *   robots: {alliance:'red'|'blue', leave:boolean, park:boolean}[],
 * }} snap
 */
export function computeScore(snap) {
  const out = {};
  for (const a of ALLIANCES) {
    const robots = (snap.robots || []).filter((r) => r.alliance === a);
    const nLeave = robots.filter((r) => r.leave).length;
    const nPark = robots.filter((r) => r.park).length;
    const nTips = snap.tips?.[a] ?? 0;
    const nCell = snap.cell?.[a] ?? 0;
    const nGarden = snap.garden?.[a] ?? 0;
    let owned = 0;
    let ownedElems = 0;
    let bottom = 0;
    for (const f of snap.flowers || []) {
      const r = scoreFlower(f);
      if (r.owner === a) {
        owned++;
        ownedElems += r.count;
      }
      if (r.bottom === a) bottom++;
    }
    const rows = {
      tips: { n: nTips, pts: nTips * SCORE_POINTS.TIP },
      cell: { n: nCell, pts: nCell * SCORE_POINTS.CELL },
      flower: { n: ownedElems, owned, pts: ownedElems * SCORE_POINTS.FLOWER_OWNED },
      bottomNectar: { n: bottom, pts: bottom * SCORE_POINTS.BOTTOM_NECTAR },
      garden: { n: nGarden, pts: nGarden * SCORE_POINTS.GARDEN },
      leave: { n: nLeave, pts: nLeave * SCORE_POINTS.LEAVE, indicative: true },
      park: { n: nPark, pts: nPark * SCORE_POINTS.PARK_TELEOP, indicative: true },
    };
    const total = Object.values(rows).reduce((s, r) => s + r.pts, 0);
    const swarm = rows.leave.pts + rows.park.pts;
    out[a] = {
      ...rows,
      total,
      rp: {
        swarm: { value: swarm, threshold: RP_THRESHOLDS.SWARM, earned: swarm >= RP_THRESHOLDS.SWARM, indicative: true },
        pollinator1: { value: nTips, threshold: RP_THRESHOLDS.POLLINATOR_1, earned: nTips >= RP_THRESHOLDS.POLLINATOR_1 },
        pollinator2: { value: nTips, threshold: RP_THRESHOLDS.POLLINATOR_2, earned: nTips >= RP_THRESHOLDS.POLLINATOR_2 },
      },
    };
    out[a].rpTotal = Object.values(out[a].rp).filter((r) => r.earned).length;
  }
  return out;
}

/** Cirkel (cx, cy, r) raakt as-uitgelijnde rechthoek {x0,x1,y0,y1}? ("minstens gedeeltelijk in"). */
export function circleTouchesRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x0, Math.min(cx, rect.x1));
  const ny = Math.max(rect.y0, Math.min(cy, rect.y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

/**
 * Hoekpunten van de robot-footprint in wereldcoördinaten.
 * @param {number} x
 * @param {number} y
 * @param {number} yaw
 * @param {{x0:number,x1:number,y0:number,y1:number}} fp  footprint in robotframe (m)
 */
export function footprintCorners(x, y, yaw, fp) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    [fp.x1, fp.y1],
    [fp.x1, fp.y0],
    [fp.x0, fp.y0],
    [fp.x0, fp.y1],
  ].map(([lx, ly]) => [x + c * lx - s * ly, y + s * lx + c * ly]);
}

/** Overlapt de gedraaide footprint de as-uitgelijnde rechthoek (SAT)? */
export function footprintTouchesRect(x, y, yaw, fp, rect) {
  const pts = footprintCorners(x, y, yaw, fp);
  const rc = [
    [rect.x0, rect.y0],
    [rect.x1, rect.y0],
    [rect.x1, rect.y1],
    [rect.x0, rect.y1],
  ];
  const axes = [
    [1, 0],
    [0, 1],
    [Math.cos(yaw), Math.sin(yaw)],
    [-Math.sin(yaw), Math.cos(yaw)],
  ];
  for (const [ax, ay] of axes) {
    const pa = pts.map(([px, py]) => px * ax + py * ay);
    const pb = rc.map(([px, py]) => px * ax + py * ay);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

/** Kleinste afstand van de footprint tot de perimeter-muren (negatief = erdoor). */
export function wallClearance(x, y, yaw, fp, half = HALF) {
  let m = Infinity;
  for (const [px, py] of footprintCorners(x, y, yaw, fp)) {
    m = Math.min(m, half - Math.abs(px), half - Math.abs(py));
  }
  return m;
}

/**
 * Leest de MuJoCo-toestand en maakt er een score van. Read-only t.o.v. de simulatie.
 */
export class BiobuzzScorer {
  constructor(mujoco, model, data, { mech, hiveTip }) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.mech = mech;
    this.hiveTip = hiveTip;
    const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
    const GEOM = mujoco.mjtObj.mjOBJ_GEOM.value;
    this.robotId = mujoco.mj_name2id(model, BODY, 'robot');
    /** Footprint in robotframe; bij reset() opnieuw gemeten uit de botsende geoms. */
    this.footprint = { x0: -0.215, x1: 0.215, y0: -0.19, y1: 0.19 };
    const rectOf = (name, fallback) => {
      const g = mujoco.mj_name2id(model, GEOM, name);
      if (g < 0) return fallback;
      const px = model.geom_pos[g * 3];
      const py = model.geom_pos[g * 3 + 1];
      const sx = model.geom_size[g * 3];
      const sy = model.geom_size[g * 3 + 1];
      return { x0: px - sx, x1: px + sx, y0: py - sy, y1: py + sy };
    };
    this.garden = {
      red: rectOf('garden_red', { x0: -HALF, x1: -HALF + 0.584, y0: -HALF, y1: -HALF + 0.051 }),
      blue: rectOf('garden_blue', { x0: HALF - 0.584, x1: HALF, y0: HALF - 0.051, y1: HALF }),
    };
    this.loading = { red: rectOf('loading_red', null), blue: rectOf('loading_blue', null) };

    /** @type {{bid:number, kind:'pollen'|'nectar', color:string|null, r:number, vadr:number}[]} */
    this.elements = [];
    for (let i = 0; i < model.nbody; i++) {
      const name = mujoco.mj_id2name(model, BODY, i) || '';
      const jnt = model.body_jntadr[i];
      if (jnt < 0) continue;
      if (name.startsWith('pollen_')) {
        this.elements.push({ bid: i, kind: 'pollen', color: null, r: POLLEN_R, vadr: model.jnt_dofadr[jnt] });
      } else if (name.startsWith('nectar_') && !name.includes('intake')) {
        const color = name.includes('red') ? 'red' : name.includes('blue') ? 'blue' : null;
        this.elements.push({ bid: i, kind: 'nectar', color, r: NECTAR_R, vadr: model.jnt_dofadr[jnt] });
      }
    }
    this.reset();
  }

  /** Na reset sim: robot-alliantie volgt uit de startpositie (x < 0 = rode kant), LEAVE uit. */
  reset() {
    this.mujoco.mj_forward(this.model, this.data); // alleen afgeleide grootheden (xpos/xmat), geen toestand
    this.footprint = this._measureFootprint() || this.footprint;
    const jnt = this.robotId >= 0 ? this.model.body_jntadr[this.robotId] : -1;
    const x = jnt >= 0 ? this.data.qpos[this.model.jnt_qposadr[jnt]] : this._robotPose()[0];
    this.robotAlliance = x <= 0 ? 'red' : 'blue';
    this.leave = false;
  }

  /**
   * XY-omhullende (robotframe) van alle botsende geoms van de robot: bumper, intakes, wielen...
   * De achter-intake steekt 4,5 cm achter de bumper uit; die raakt bij de start de muur.
   */
  _measureFootprint() {
    const m = this.model;
    const d = this.data;
    if (this.robotId < 0) return null;
    const inRobot = (bid) => {
      for (let b = bid; b > 0; b = m.body_parentid[b]) if (b === this.robotId) return true;
      return false;
    };
    const ro = this.robotId * 3;
    const rb = this.robotId * 9;
    const R = d.xmat;
    const toLocal = (wx, wy, wz) => {
      const px = wx - d.xpos[ro];
      const py = wy - d.xpos[ro + 1];
      const pz = wz - d.xpos[ro + 2];
      return [R[rb] * px + R[rb + 3] * py + R[rb + 6] * pz, R[rb + 1] * px + R[rb + 4] * py + R[rb + 7] * pz];
    };
    const BOX = this.mujoco.mjtGeom?.mjGEOM_BOX?.value ?? 6;
    let fp = null;
    const grow = ([lx, ly]) => {
      if (!fp) fp = { x0: lx, x1: lx, y0: ly, y1: ly };
      fp.x0 = Math.min(fp.x0, lx);
      fp.x1 = Math.max(fp.x1, lx);
      fp.y0 = Math.min(fp.y0, ly);
      fp.y1 = Math.max(fp.y1, ly);
    };
    for (let g = 0; g < m.ngeom; g++) {
      if (!inRobot(m.geom_bodyid[g])) continue;
      if (!m.geom_contype[g] && !m.geom_conaffinity[g]) continue;
      const gx = d.geom_xpos[g * 3];
      const gy = d.geom_xpos[g * 3 + 1];
      const gz = d.geom_xpos[g * 3 + 2];
      if (m.geom_type[g] === BOX) {
        const sz = [m.geom_size[g * 3], m.geom_size[g * 3 + 1], m.geom_size[g * 3 + 2]];
        const G = d.geom_xmat;
        const b = g * 9;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz2 of [-1, 1]) {
          const l = [sx * sz[0], sy * sz[1], sz2 * sz[2]];
          grow(toLocal(
            gx + G[b] * l[0] + G[b + 1] * l[1] + G[b + 2] * l[2],
            gy + G[b + 3] * l[0] + G[b + 4] * l[1] + G[b + 5] * l[2],
            gz + G[b + 6] * l[0] + G[b + 7] * l[1] + G[b + 8] * l[2],
          ));
        }
      } else {
        const [lx, ly] = toLocal(gx, gy, gz);
        const r = m.geom_size[g * 3]; // straal (cilinder/bol/capsule): wielen
        grow([lx - r, ly - r]);
        grow([lx + r, ly + r]);
      }
    }
    return fp;
  }

  _robotPose() {
    const o = this.robotId * 3;
    const R = this.data.xmat;
    const b = this.robotId * 9;
    return [this.data.xpos[o], this.data.xpos[o + 1], Math.atan2(R[b + 3], R[b])];
  }

  /** Per physics-stap: LEAVE vergrendelen zodra de robot de muur niet meer raakt. */
  tick() {
    if (this.leave || this.robotId < 0) return;
    const [x, y, yaw] = this._robotPose();
    if (wallClearance(x, y, yaw, this.footprint) >= LEAVE_WALL_CLEARANCE) {
      this.leave = true;
    }
  }

  /** Robot nu (deels) in zijn LOADING ZONE? */
  parkedNow() {
    const rect = this.loading[this.robotAlliance];
    if (!rect || this.robotId < 0) return false;
    const [x, y, yaw] = this._robotPose();
    return footprintTouchesRect(x, y, yaw, this.footprint, rect);
  }

  _speed(e) {
    const v = this.data.qvel;
    return Math.hypot(v[e.vadr], v[e.vadr + 1], v[e.vadr + 2]);
  }

  /** Veld-snapshot voor computeScore + metadata (aantal bewegende elementen). */
  snapshot() {
    const d = this.data;
    const held = new Set([...(this.mech?.stored || []), ...(this.mech?.rearStored || [])]);
    const cellKey = {};
    const tipping = {};
    for (const a of ALLIANCES) {
      cellKey[a] = this.hiveTip?.upwardCellKey?.(a);
      tipping[a] = !!this.hiveTip?.isTipping?.(a);
    }
    const cell = { red: 0, blue: 0 };
    const garden = { red: 0, blue: 0 };
    const flowers = FLOWER_CAD_XY.map(() => []);
    let moving = 0;
    const zLo = TILE_THICKNESS + FLOWER_SCORE_Z_MIN;
    const zHi = TILE_THICKNESS + FLOWER_SCORE_Z_MAX;
    for (const e of this.elements) {
      if (held.has(e.bid)) continue;
      const x = d.xpos[e.bid * 3];
      const y = d.xpos[e.bid * 3 + 1];
      const z = d.xpos[e.bid * 3 + 2];
      if (z > 2.5 || z < -0.5 || Math.abs(x) > HALF + 0.5 || Math.abs(y) > HALF + 0.5) continue; // geparkeerd/van het veld
      if (this._speed(e) >= REST_SPEED) {
        moving++;
        continue;
      }
      for (const a of ALLIANCES) {
        if (!tipping[a] && cellKey[a] && this.hiveTip._inCell(e.bid, cellKey[a], 0)) cell[a]++;
        if (z < 0.3 && circleTouchesRect(x, y, e.r, this.garden[a])) garden[a]++;
      }
      for (let i = 0; i < FLOWER_CAD_XY.length; i++) {
        const [fx, fy] = FLOWER_CAD_XY[i];
        if (Math.hypot(x - fx, y - fy) > FLOWER_SCORE_R) continue;
        if (z + e.r < zLo || z - e.r > zHi) continue;
        flowers[i].push({ kind: e.kind, color: e.color, z });
      }
    }
    return {
      tips: { red: this.hiveTip?.tipCount?.red ?? 0, blue: this.hiveTip?.tipCount?.blue ?? 0 },
      cell,
      flowers,
      garden,
      robots: [{ alliance: this.robotAlliance, leave: this.leave, park: this.parkedNow() }],
      moving,
    };
  }

  /** Volledige, JSON-veilige score (kopie). */
  score() {
    const snap = this.snapshot();
    const alliances = computeScore(snap);
    return {
      red: alliances.red,
      blue: alliances.blue,
      robotAlliance: this.robotAlliance,
      settled: snap.moving === 0,
      moving: snap.moving,
      clock: false,
      flowers: snap.flowers.map((f) => scoreFlower(f)),
      note:
        'Zonder wedstrijdklok: LEAVE/PARK/SWARM zijn indicatief; AUTO PARK, WIN/TIE en fouten worden niet gescoord.',
    };
  }
}
