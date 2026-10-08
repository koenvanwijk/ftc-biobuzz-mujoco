/**
 * Echte BIOBUZZ-scène (MuJoCo WASM) + BiobuzzHardwareAdapter:
 * - G407: start met 4 preload-POLLEN = vol; intake weigert een 5e (voor én achter); na schieten weer ruimte;
 * - kantelregel: 3 gestagede NECTAR + 3 POLLEN kantelt (+20), + 2 POLLEN houdt; 7 POLLEN houdt, 8 kantelt;
 * - score-rijen uit de veldtoestand: GARDEN, CELL, FLOWER-eigenaar/bonus, LEAVE, PARK, alleen in rust;
 * - LOADING ZONES op TILE A5/F2 en GARDENS op A1/F6 (Guide §8.3/§8.4), startpose volgens G304.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { BiobuzzHardwareAdapter } from '../../src/mujoco/BiobuzzHardwareAdapter.js';
import {
  EXTRA_NECTAR_GRID_STEP,
  EXTRA_NECTAR_SPAWN,
  FLOWER_CAD_XY,
  LOADING_ZONE_RECT,
  GARDEN_RECT,
  NECTAR_R,
  TILE_SIZE,
  TILE_THICKNESS,
  tileCenter,
} from '../../src/worlds/biobuzz/constants.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../public/assets');
const simCfg = JSON.parse(fs.readFileSync(path.resolve(here, '../../robots/BIOBUZZ/simulation.json'), 'utf8'));

let mujoco;
before(async () => {
  mujoco = await loadMujoco();
  mujoco.FS.mkdir('/scene');
  for (const d of ['meshes', 'textures']) {
    mujoco.FS.mkdir(`/scene/${d}`);
    for (const f of fs.readdirSync(path.join(assets, d))) {
      mujoco.FS.writeFile(`/scene/${d}/${f}`, new Uint8Array(fs.readFileSync(path.join(assets, d, f))));
    }
  }
  mujoco.FS.writeFile('/scene/biobuzz_scene.xml', fs.readFileSync(path.join(assets, 'biobuzz_scene.xml'), 'utf8'));
});

function sim() {
  const model = mujoco.MjModel.mj_loadXML('/scene/biobuzz_scene.xml');
  const data = new mujoco.MjData(model);
  mujoco.mj_resetDataKeyframe(model, data, 0);
  const ad = new BiobuzzHardwareAdapter(mujoco, model, data, simCfg);
  ad.resetPose();
  const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
  const SITE = mujoco.mjtObj.mjOBJ_SITE.value;
  const JNT = mujoco.mjtObj.mjOBJ_JOINT.value;
  const bid = (name) => mujoco.mj_name2id(model, BODY, name);
  const place = (name, x, y, z, vel = [0, 0, 0]) => {
    const b = bid(name);
    assert.ok(b >= 0, name);
    const j = model.body_jntadr[b];
    data.qpos.set([x, y, z, 1, 0, 0, 0], model.jnt_qposadr[j]);
    data.qvel.set([...vel, 0, 0, 0], model.jnt_dofadr[j]);
  };
  const site = (name) => {
    const s = mujoco.mj_name2id(model, SITE, name);
    return [0, 1, 2].map((k) => data.site_xpos[s * 3 + k]);
  };
  const placeRobot = (x, y, yaw = 0) => {
    const j = mujoco.mj_name2id(model, JNT, 'robot_free');
    data.qpos.set([x, y, data.qpos[model.jnt_qposadr[j] + 2], Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)], model.jnt_qposadr[j]);
    for (let k = 0; k < 6; k++) data.qvel[model.jnt_dofadr[j] + k] = 0;
  };
  /** Punt in een CELL: lokaal (lx over de breedte, ly naar de opening, lz) → wereld. */
  const inCell = (key, lx, ly = 0, lz = 0) => {
    const s = bid(`${key}_shell`);
    const R = data.xmat;
    const b = s * 9;
    return [0, 1, 2].map((r) => data.xpos[s * 3 + r] + R[b + r * 3] * lx + R[b + r * 3 + 1] * ly + R[b + r * 3 + 2] * lz);
  };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      ad.physicsTick(model.opt.timestep);
      mujoco.mj_step(model, data);
    }
  };
  const fwd = () => mujoco.mj_forward(model, data);
  return { model, data, ad, place, site, placeRobot, inCell, tick, fwd, bid };
}

describe('G407 in de echte scène', () => {
  it('start = 4 preload-POLLEN (G304.G) = vol; intake weigert een 5e POLLEN en NECTAR', () => {
    const s = sim();
    assert.equal(s.ad.mech.controlledCount, 4);
    assert.equal(s.ad.mech.atControlLimit, true);
    assert.equal(s.ad.getHud().controlled, 4);
    assert.equal(s.ad.getHud().controlLimit, 4);
    s.ad.mech.setIntakePower(1);
    const [fx, fy, fz] = s.site('intake_site');
    s.place('pollen_00', fx, fy, fz);
    const [rx, ry, rz] = s.site('nectar_intake_site');
    s.place('nectar_blue_0', rx, ry, rz);
    s.fwd();
    s.tick();
    assert.equal(s.ad.mech.controlledCount, 4, 'geen 5e element');
    assert.equal(s.ad.mech.stored.includes(s.bid('pollen_00')), false);
    assert.equal(s.ad.mech.rearStored.length, 0);
  });

  it('na één schot (gelanceerd telt niet meer) pakt de intake er weer precies één op', () => {
    const s = sim();
    assert.equal(s.ad.mech.fire(), true);
    s.tick();
    assert.equal(s.ad.mech.controlledCount, 3);
    s.ad.mech.setIntakePower(1);
    const [fx, fy, fz] = s.site('intake_site');
    s.place('pollen_00', fx, fy, fz);
    s.place('pollen_01', fx, fy + 0.01, fz);
    s.fwd();
    s.tick();
    assert.equal(s.ad.mech.controlledCount, 4);
    assert.equal(s.ad.mech.atControlLimit, true);
  });

  it('achter-intake (NECTAR) telt mee in dezelfde 4', () => {
    const s = sim();
    s.ad.mech.fire();
    s.tick();
    s.ad.mech.fire();
    s.tick();
    assert.equal(s.ad.mech.controlledCount, 2);
    s.ad.mech.setIntakePower(1);
    const [rx, ry, rz] = s.site('nectar_intake_site');
    s.place('nectar_blue_0', rx, ry, rz);
    s.place('nectar_blue_1', rx, ry + 0.01, rz);
    s.place('nectar_blue_2', rx, ry - 0.01, rz);
    s.fwd();
    s.tick();
    assert.equal(s.ad.mech.rearStored.length, 2);
    assert.equal(s.ad.mech.controlledCount, 4);
  });
});

describe('HIVE-kantelregel in de echte scène (Guide §12.3)', () => {
  const pollenIn = (s, key, n, start = 30) => {
    for (let i = 0; i < n; i++) {
      const lx = -0.18 + 0.12 * (i % 4);
      const lz = -0.08 + 0.1 * Math.floor(i / 4);
      s.place(`pollen_${String(start + i).padStart(2, '0')}`, ...s.inCell(key, lx, 0.03, lz));
    }
  };
  it('3 gestagede NECTAR + 2 POLLEN houdt; + 3e POLLEN kantelt, +20 en tipCount 1', () => {
    const s = sim();
    const key = s.ad.hiveTip.upwardCellKey('red');
    assert.deepEqual(s.ad.hiveTip.countInUpwardCell('red'), [3, 0]);
    pollenIn(s, key, 2);
    s.fwd();
    s.tick();
    assert.equal(s.ad.hiveTip.tipCount.red, 0, '3N+2P houdt');
    assert.deepEqual(s.ad.hiveTip.countInUpwardCell('red'), [3, 2]);
    pollenIn(s, key, 3);
    s.fwd();
    s.tick();
    assert.equal(s.ad.hiveTip.tipCount.red, 1, '3N+3P kantelt');
    assert.equal(s.ad.hiveTip.score.red, 20);
    assert.equal(s.ad.getScore().red.tips.pts, 20);
    assert.notEqual(s.ad.hiveTip.upwardCellKey('red'), key);
    // G427: de extra NECTAR komt in de rode LOADING ZONE (A5) het veld op.
    assert.equal(s.ad.hiveTip.extrasReleased.red, 1);
    const b = s.bid('nectar_extra_red_0');
    const [nx, ny] = [s.data.qpos[s.model.jnt_qposadr[s.model.body_jntadr[b]]], s.data.qpos[s.model.jnt_qposadr[s.model.body_jntadr[b]] + 1]];
    const z = s.ad.scorer.loading.red;
    assert.ok(nx > z.x0 && nx < z.x1 && ny > z.y0 && ny < z.y1, `extra NECTAR (${nx.toFixed(3)}, ${ny.toFixed(3)}) in de LOADING ZONE`);
  });

  it('zonder NECTAR: 7 POLLEN houdt, 8 kantelt', () => {
    const s = sim();
    const key = s.ad.hiveTip.upwardCellKey('blue');
    for (let i = 0; i < 3; i++) s.place(`nectar_blue_${i}`, 0.8 + 0.12 * i, 0.9, 0.06);
    pollenIn(s, key, 7);
    s.fwd();
    s.tick();
    assert.deepEqual(s.ad.hiveTip.countInUpwardCell('blue'), [0, 7]);
    assert.equal(s.ad.hiveTip.tipCount.blue, 0, '7P houdt');
    pollenIn(s, key, 8);
    s.fwd();
    s.tick();
    assert.equal(s.ad.hiveTip.tipCount.blue, 1, '8P kantelt');
    assert.equal(s.ad.getScore().blue.tips.pts, 20);
  });
});

describe('Score uit de veldtoestand (TU03 §10.5)', () => {
  it('beginstand: 3 NECTAR in elke omhoog-CELL (2 p.), 4 POLLEN in elke GARDEN (1 p.), geen LEAVE', () => {
    const s = sim();
    s.tick(300);
    const sc = s.ad.getScore();
    assert.equal(sc.clock, false);
    assert.equal(sc.robotAlliance, 'red');
    assert.equal(sc.settled, true);
    for (const a of ['red', 'blue']) {
      assert.equal(sc[a].cell.n, 3, `${a} CELL`);
      assert.equal(sc[a].garden.n, 4, `${a} GARDEN`);
      assert.equal(sc[a].tips.n, 0);
      assert.equal(sc[a].flower.pts, 0, 'gestagede POLLEN zonder NECTAR: geen eigenaar');
      assert.equal(sc[a].bottomNectar.pts, 0);
    }
    assert.equal(sc.red.leave.pts, 0, 'robot staat tegen de muur');
    assert.equal(sc.blue.leave.pts, 0);
    assert.equal(sc.red.park.pts, 0, 'G304.E: start niet in de LOADING ZONE');
    assert.equal(sc.red.total, 10, 'CELL 6 + GARDEN 4');
    assert.equal(sc.blue.total, 10);
  });

  it('LEAVE vergrendelt zodra de robot los van de muur is; PARK = nu in de LOADING ZONE', () => {
    const s = sim();
    s.placeRobot(-1.0, 0.6, 0);
    s.fwd();
    s.tick();
    let sc = s.ad.getScore();
    assert.equal(sc.red.leave.pts, 3);
    assert.equal(sc.red.park.pts, 0);
    s.placeRobot(-1.35, 0.91, 0); // achterkant over de rand van de rode LOADING ZONE (A5)
    s.fwd();
    sc = s.ad.getScore();
    assert.equal(sc.red.leave.pts, 3, 'LEAVE blijft staan');
    assert.equal(sc.red.park.pts, 5);
    assert.equal(sc.red.rp.swarm.value, 8);
    assert.equal(sc.blue.park.pts, 0);
    s.ad.resetPose();
    assert.equal(s.ad.getScore().red.leave.pts, 0, 'Reset sim wist LEAVE');
  });

  it('GARDEN telt alleen in rust; CELL-element van de andere kleur telt voor de HIVE-eigenaar', () => {
    const s = sim();
    s.place('pollen_30', -1.40, -1.79, TILE_THICKNESS + 0.0356); // rode GARDEN (A1, publieksmuur −Y)
    s.place('pollen_31', -1.30, -1.79, TILE_THICKNESS + 0.0356, [0.5, 0, 0]); // rolt nog
    s.place('nectar_blue_0', ...s.inCell(s.ad.hiveTip.upwardCellKey('red'), 0.18, 0.03, 0.0));
    s.fwd();
    const sc = s.ad.getScore();
    assert.equal(sc.red.garden.n, 5);
    assert.equal(sc.moving >= 1, true);
    assert.equal(sc.settled, false);
    assert.equal(sc.red.cell.n, 4);
  });

  it('FLOWER: bovenste NECTAR = eigenaar (2 p. per element), onderste NECTAR = +5', () => {
    const s = sim();
    const [fx, fy] = FLOWER_CAD_XY[0];
    const before = s.ad.getScore().flowers[0].count;
    s.place('nectar_blue_0', fx, fy, TILE_THICKNESS + 0.30);
    s.place('nectar_red_0', fx, fy, TILE_THICKNESS + 0.45);
    s.fwd();
    const sc = s.ad.getScore();
    assert.deepEqual(sc.flowers[0], { owner: 'red', bottom: 'blue', count: before + 2 });
    assert.equal(sc.red.flower.pts, 2 * (before + 2));
    assert.equal(sc.red.flower.owned, 1);
    assert.equal(sc.blue.bottomNectar.pts, 5);
    assert.equal(sc.red.bottomNectar.pts, 0);
  });
});

describe('LOADING ZONE, GARDEN en startpose (Guide §8.3/§8.4, manual §9.3/§9.4, G304)', () => {
  const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
  it('TILE-raster: A1 = rode hoek aan de publiekszijde (−Y), F6 = blauwe hoek achter (+Y)', () => {
    assert.deepEqual(tileCenter('A1').map((v) => +v.toFixed(4)), [-1.524, -1.524]);
    assert.deepEqual(tileCenter('F6').map((v) => +v.toFixed(4)), [1.524, 1.524]);
    assert.ok(near(tileCenter('A5')[1], 0.9144));
    assert.ok(near(tileCenter('F2')[1], -0.9144));
  });

  it('scène-geoms: rode LOADING ZONE op A5, blauwe op F2 (23 × 11 in, tegen de alliantiemuur)', () => {
    const s = sim();
    for (const [color, tile] of [['red', 'A5'], ['blue', 'F2']]) {
      const z = s.ad.scorer.loading[color];
      const ref = LOADING_ZONE_RECT[color];
      for (const k of ['x0', 'x1', 'y0', 'y1']) assert.ok(near(z[k], ref[k]), `${color} ${k}`);
      assert.ok(near(z.x1 - z.x0, 0.2795) && near(z.y1 - z.y0, 0.584), `${color} maat`);
      const [, cy] = tileCenter(tile);
      assert.ok(near((z.y0 + z.y1) / 2, cy), `${color} midden op ${tile}`);
      assert.ok(z.y0 > cy - TILE_SIZE / 2 && z.y1 < cy + TILE_SIZE / 2, `${color} binnen de TILE-naden`);
      assert.ok(color === 'red' ? near(z.x0, -1.8288) : near(z.x1, 1.8288), `${color} tegen de alliantiemuur`);
    }
  });

  it('GARDEN aan de andere kant van de alliantiemuur dan de LOADING ZONE; FLOWERS niet in een zone', () => {
    const s = sim();
    for (const color of ['red', 'blue']) {
      const g = s.ad.scorer.garden[color];
      const z = s.ad.scorer.loading[color];
      for (const k of ['x0', 'x1', 'y0', 'y1']) assert.ok(near(g[k], GARDEN_RECT[color][k]), `${color} GARDEN ${k}`);
      const gy = (g.y0 + g.y1) / 2;
      const zy = (z.y0 + z.y1) / 2;
      assert.ok(Math.abs(gy - zy) > 2.4, `${color}: GARDEN (y ${gy.toFixed(2)}) en LOADING ZONE (y ${zy.toFixed(2)}) aan tegenovergestelde uiteinden`);
      for (const [fx, fy] of FLOWER_CAD_XY) {
        const dx = Math.max(z.x0 - fx, 0, fx - z.x1);
        const dy = Math.max(z.y0 - fy, 0, fy - z.y1);
        assert.ok(Math.hypot(dx, dy) > 0.5, `FLOWER (${fx}, ${fy}) ver van de ${color} LOADING ZONE`);
      }
    }
  });

  it('extra NECTAR-vrijgaves (2 × 3 raster) vallen allemaal binnen de LOADING ZONE en overlappen niet', () => {
    for (const color of ['red', 'blue']) {
      const z = LOADING_ZONE_RECT[color];
      const pts = [];
      for (let idx = 0; idx < 5; idx++) {
        const [sx, sy] = EXTRA_NECTAR_SPAWN[color];
        const x = sx + (color === 'blue' ? 1 : -1) * EXTRA_NECTAR_GRID_STEP * (idx % 2);
        const y = sy + [0, EXTRA_NECTAR_GRID_STEP, -EXTRA_NECTAR_GRID_STEP][Math.floor(idx / 2) % 3];
        assert.ok(x - NECTAR_R > z.x0 - 1e-9 && x + NECTAR_R < z.x1 + 0.005 && y - NECTAR_R > z.y0 && y + NECTAR_R < z.y1, `${color} #${idx} in zone`);
        for (const [px, py] of pts) assert.ok(Math.hypot(x - px, y - py) >= 2 * NECTAR_R, `${color} #${idx} overlapt niet`);
        pts.push([x, y]);
      }
    }
  });

  it('startpose (G304): raakt de muur zonder erin te zitten, schuift niet weg, niet in de LOADING ZONE, 4 preload', () => {
    const s = sim();
    const fp = s.ad.scorer.footprint;
    const [x0, y0, yaw0] = s.ad.scorer._robotPose();
    assert.ok(near(x0 + fp.x0, -1.8288, 5e-4), `achterkant ${(x0 + fp.x0).toFixed(4)} op de muur`);
    assert.ok(Math.abs(yaw0) < 1e-6);
    assert.equal(s.ad.scorer.parkedNow(), false, 'niet in de LOADING ZONE');
    assert.ok(x0 < 0, 'rode helft (kolom A–C)');
    assert.equal(s.ad.mech.controlledCount, 4, 'precies 4 preload-POLLEN');
    s.tick(1000); // 2 s
    const [x1, y1] = s.ad.scorer._robotPose();
    assert.ok(Math.hypot(x1 - x0, y1 - y0) < 0.002, `robot schuift niet (${(x1 - x0).toFixed(4)}, ${(y1 - y0).toFixed(4)})`);
    // Kleinste afstand tussen de rode muur en alle botsende robot-geoms (mj_geomDistance):
    // 0 = raakt; negatief = zit erin.
    const G = mujoco.mjtObj.mjOBJ_GEOM.value;
    const wall = mujoco.mj_name2id(s.model, G, 'wall_neg_x');
    let gap = Infinity;
    for (let g = 0; g < s.model.ngeom; g++) {
      if (!s.model.geom_contype[g] && !s.model.geom_conaffinity[g]) continue;
      let b = s.model.geom_bodyid[g];
      while (b > 0 && b !== s.bid('robot')) b = s.model.body_parentid[b];
      if (b !== s.bid('robot')) continue;
      gap = Math.min(gap, mujoco.mj_geomDistance(s.model, s.data, wall, g, 0.05, null));
    }
    assert.ok(gap < 0.0005, `robot raakt de rode muur (G304.C): spleet ${(gap * 1000).toFixed(3)} mm`);
    assert.ok(gap > -0.002, `geen penetratie (${(gap * 1000).toFixed(3)} mm)`);
    const sc = s.ad.getScore();
    assert.equal(sc.red.leave.pts, 0);
    assert.equal(sc.red.park.pts, 0);
  });
});
