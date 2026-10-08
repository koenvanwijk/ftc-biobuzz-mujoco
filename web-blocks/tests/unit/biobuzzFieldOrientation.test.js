/**
 * Veld is niet (meer) gespiegeld: de sim ligt zoals het echte veld (manual Fig. 9-2, Guide Fig. 6-2).
 * Gezien vanaf het publiek (−Y): rode alliantiemuur links (−X), kolommen A→F links→rechts,
 * rijen 1→6 publiek→achter. De CAD-import is een rotatie (x, y, z) → (x, −z, y), det +1.
 * - meshes in alle kopieën gelijk en naar buiten gewonden (positief volume);
 * - LOADING ZONES A5/F2, GARDENS A1/F6, FLOWERS op de juiste TILE-naden;
 * - omhoog-CELLs bij de start (Guide §11.1): rood publiekszijde, blauw scoringszijde;
 * - AprilTag-clusters volgens FTC SDK 12 getBioBuzzTagLibrary() (IDs, ledenlayout, oorsprong).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import {
  CELL_OPEN_D,
  CELL_SHELLS,
  FLOWER_CAD_XY,
  HALF,
  TILE_SIZE,
  tileCenter,
} from '../../src/worlds/biobuzz/constants.js';
import { BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M } from '../../src/mujoco/simSensors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const assets = path.resolve(here, '../../public/assets');
const INCH = 0.0254;

let mujoco;
let model;
let data;
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
  model = mujoco.MjModel.mj_loadXML('/scene/biobuzz_scene.xml');
  data = new mujoco.MjData(model);
  mujoco.mj_resetDataKeyframe(model, data, 0);
  mujoco.mj_forward(model, data);
});

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const id = (type, name) => {
  const i = mujoco.mj_name2id(model, mujoco.mjtObj[type].value, name);
  assert.ok(i >= 0, name);
  return i;
};
const geomPos = (name) => Array.from(data.geom_xpos.slice(id('mjOBJ_GEOM', name) * 3, id('mjOBJ_GEOM', name) * 3 + 3));
const bodyPos = (name) => Array.from(data.xpos.slice(id('mjOBJ_BODY', name) * 3, id('mjOBJ_BODY', name) * 3 + 3));
const siteFrame = (name) => {
  const s = id('mjOBJ_SITE', name);
  const m = data.site_xmat.slice(s * 9, s * 9 + 9);
  return {
    p: Array.from(data.site_xpos.slice(s * 3, s * 3 + 3)),
    r: [m[0], m[3], m[6]],
    u: [m[1], m[4], m[7]],
    n: [m[2], m[5], m[8]],
  };
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const seam = (k) => -HALF + k * TILE_SIZE; // naad k (0 = muur)

/** Minimale PNG-lezer (8-bit, niet-interlaced, grijs/RGB/RGBA) → helderheid per pixel. */
function readPngGray(file) {
  const buf = fs.readFileSync(file);
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      assert.equal(body[8], 8, 'bit depth 8');
      ct = body[9];
      assert.equal(body[12], 0, 'niet interlaced');
    } else if (type === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  assert.ok(bpp, `kleurtype ${ct}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return { w, h, at: (x, y) => px[y * stride + x * bpp] };
}

/** Getekend volume van een binaire STL (> 0 = normalen naar buiten). */
function stlSignedVolume(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  let v = 0;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const p = [0, 1, 2].map((k) => [0, 1, 2].map((j) => buf.readFloatLE(o + k * 12 + j * 4)));
    v += dot(p[0], cross(p[1], p[2])) / 6;
  }
  return v;
}

describe('Veldoriëntatie = echt veld (niet gespiegeld)', () => {
  it('alle vier de scènekopieën en de mesh-kopieën zijn identiek', () => {
    const scenes = ['ftc_sim/assets', 'web/public/assets', 'web/assets', 'web-blocks/public/assets'].map((d) =>
      md5(path.join(repo, d, 'biobuzz_scene.xml')),
    );
    assert.equal(new Set(scenes).size, 1, scenes.join(' '));
    for (const f of fs.readdirSync(path.join(assets, 'meshes')).filter((x) => x.endsWith('.stl'))) {
      const sums = ['ftc_sim/assets/meshes', 'web/public/assets/meshes', 'web-blocks/public/assets/meshes'].map((d) =>
        md5(path.join(repo, d, f)),
      );
      assert.equal(new Set(sums).size, 1, f);
    }
  });

  it('meshes zijn niet binnenstebuiten: convexe hulls hebben een positief getekend volume', () => {
    const hulls = fs.readdirSync(path.join(assets, 'meshes')).filter((f) => f.endsWith('_hull.stl'));
    assert.ok(hulls.length >= 7);
    for (const f of hulls) {
      const v = stlSignedVolume(path.join(assets, 'meshes', f));
      assert.ok(v > 0, `${f}: volume ${v}`);
    }
  });

  it('TILE-raster: A1 linksvoor (rood, publiek), F6 rechtsachter (blauw)', () => {
    const [ax, ay] = tileCenter('A1');
    const [fx, fy] = tileCenter('F6');
    assert.ok(ax < 0 && ay < 0, 'A1 = (−X, −Y)');
    assert.ok(fx > 0 && fy > 0, 'F6 = (+X, +Y)');
    assert.ok(tileCenter('B1')[0] > ax && tileCenter('A2')[1] > ay, 'A→F = +X, 1→6 = +Y');
  });

  it('LOADING ZONES op A5 (rood, −X) en F2 (blauw, +X); GARDENS op A1 (publieksmuur) en F6 (achtermuur)', () => {
    const lr = geomPos('loading_red');
    const lb = geomPos('loading_blue');
    assert.ok(Math.abs(lr[1] - tileCenter('A5')[1]) < 1e-4 && lr[0] < -1.6, `rood ${lr}`);
    assert.ok(Math.abs(lb[1] - tileCenter('F2')[1]) < 1e-4 && lb[0] > 1.6, `blauw ${lb}`);
    const gr = geomPos('garden_red');
    const gb = geomPos('garden_blue');
    assert.ok(gr[1] < -HALF + 0.06 && Math.abs(gr[0] - tileCenter('A1')[0]) < 0.02, `rode GARDEN ${gr}`);
    assert.ok(gb[1] > HALF - 0.06 && Math.abs(gb[0] - tileCenter('F6')[0]) < 0.02, `blauwe GARDEN ${gb}`);
  });

  it('FLOWERS op de TILE-naden zoals Fig. 9-2: rode muur 2/3, publiek D/E, achter B/C, blauwe muur 4/5', () => {
    const want = {
      flower_neg_x: [-HALF, seam(2)],
      flower_neg_y: [seam(4), -HALF],
      flower_pos_y: [seam(2), HALF],
      flower_pos_x: [HALF, seam(4)],
    };
    for (const [name, [wx, wy]] of Object.entries(want)) {
      const [x, y] = geomPos(`${name}_floor`);
      const alongWall = Math.abs(wx) === HALF ? Math.abs(y - wy) : Math.abs(x - wx);
      const toWall = Math.abs(wx) === HALF ? Math.abs(x - wx) : Math.abs(y - wy);
      assert.ok(alongWall < 0.02, `${name} (${x.toFixed(3)}, ${y.toFixed(3)}) op de naad`);
      assert.ok(toWall < 0.15, `${name} tegen de muur`);
      assert.ok(FLOWER_CAD_XY.some(([fx, fy]) => Math.hypot(fx - x, fy - y) < 1e-3), `${name} in FLOWER_CAD_XY`);
    }
  });

  it('beginstand HIVE (Guide §11.1): rode publiekszijde-CELL en blauwe scoringszijde-CELL omhoog, met de NECTAR erin', () => {
    const opening = (key) => {
      const b = id('mjOBJ_BODY', `${key}_shell`);
      const m = data.xmat.slice(b * 9, b * 9 + 9);
      const p = bodyPos(`${key}_shell`);
      const s = CELL_SHELLS[key].open_sign * (CELL_OPEN_D / 2);
      return [p[0] + m[1] * s, p[1] + m[4] * s, p[2] + m[7] * s];
    };
    const ra = opening('red_audience');
    const rs = opening('red_scoring');
    const ba = opening('blue_audience');
    const bs = opening('blue_scoring');
    assert.ok(ra[1] < 0 && rs[1] > 0 && ba[1] < 0 && bs[1] > 0, 'publiekszijde = −Y');
    assert.ok(ra[0] < 0 && bs[0] > 0, 'rood −X, blauw +X');
    assert.ok(ra[2] > rs[2] + 0.4, `rood: publiekszijde omhoog (${ra[2].toFixed(3)} > ${rs[2].toFixed(3)})`);
    assert.ok(bs[2] > ba[2] + 0.4, `blauw: scoringszijde omhoog (${bs[2].toFixed(3)} > ${ba[2].toFixed(3)})`);
    for (let i = 0; i < 3; i++) {
      const r = bodyPos(`nectar_red_${i}`);
      const b = bodyPos(`nectar_blue_${i}`);
      assert.ok(r[0] < 0 && r[1] < 0 && r[2] > 1.2, `nectar_red_${i} in de rode publiekszijde-CELL ${r}`);
      assert.ok(b[0] > 0 && b[1] > 0 && b[2] > 1.2, `nectar_blue_${i} in de blauwe scoringszijde-CELL ${b}`);
    }
  });

  it('AprilTag-texturen = officiële tag36h11-afbeeldingen, rechtop (niet gespiegeld of 180° gedraaid)', () => {
    // 36-bit codes uit github.com/AprilRobotics/apriltag-imgs (tag36h11), 6 × 6 databits rij voor rij
    // vanaf linksboven van de rechtop staande afbeelding (zoals de BIOBUZZ-productie-PDF).
    const OFFICIAL = {
      30: 0xe4aba3076, 31: 0x2dde6a3da, 32: 0x43d40c678, 33: 0x5620be351,
      34: 0x64c47fa65, 35: 0x686d7002a, 36: 0x6c16605ef, 37: 0x6fbf50bb4,
      38: 0x8d06d39dc, 39: 0x9f53856b5, 40: 0xadf746dc9, 41: 0xbc9b084dd,
      42: 0xd290aa77b, 43: 0xd9e28b305, 44: 0xe4dd5c454, 45: 0xfad2fe6f2,
    };
    for (const [tid, code] of Object.entries(OFFICIAL)) {
      for (const dir of ['ftc_sim/assets/textures', 'web/public/assets/textures', 'web-blocks/public/assets/textures']) {
        const img = readPngGray(path.join(repo, dir, `apriltag_${tid}.png`));
        const cell = img.w / 10; // 10 × 10 cellen: witte rand, zwarte rand, 6 × 6 data
        let bits = 0;
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 6; c++) {
            const white = img.at(Math.floor((c + 2.5) * cell), Math.floor((r + 2.5) * cell)) > 128;
            bits = bits * 2 + (white ? 1 : 0);
          }
        }
        assert.equal(bits, code, `${dir}/apriltag_${tid}.png`);
        assert.ok(img.at(1, 1) > 128 && img.at(Math.floor(1.5 * cell), Math.floor(1.5 * cell)) < 128, 'witte en zwarte rand');
      }
    }
  });

  it('AprilTag-clusters volgens SDK 12 (IDs per CELL, 3,25 in, leden op −6,5/−2,75/2,75/6,5 in, oorsprong ≈ CELL-opening)', () => {
    const clusters = {
      red_scoring: { ids: [30, 31, 32, 33], side: -1, end: +1 },
      red_audience: { ids: [34, 35, 36, 37], side: -1, end: -1 },
      blue_audience: { ids: [38, 39, 40, 41], side: +1, end: -1 },
      blue_scoring: { ids: [42, 43, 44, 45], side: +1, end: +1 },
    };
    for (const [key, spec] of Object.entries(clusters)) {
      const f = spec.ids.map((t) => siteFrame(`apriltag_${t}`));
      const mean = [0, 1, 2].map((i) => f.reduce((s, x) => s + x.p[i], 0) / 4);
      const { r, u, n } = f[0];
      assert.ok(Math.abs(dot(cross(r, u), n) - 1) < 1e-6, `${key}: rechtshandig frame (geen spiegeling)`);
      assert.ok(Math.sign(mean[0]) === spec.side && Math.sign(mean[1]) === spec.end, `${key} op de juiste CELL ${mean}`);
      assert.ok(n[2] < -0.5, `${key}: tags kijken naar de TILES`);
      // Leden langs gedrukt-rechts in SDK-volgorde.
      f.forEach((x, k) => {
        assert.ok(Math.abs(dot(sub(x.p, mean), r) - BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M[k][0]) < 1e-4, `${key} lid ${k}`);
        assert.ok(Math.abs(dot(sub(x.p, mean), u)) < 1e-4 && Math.abs(dot(sub(x.p, mean), n)) < 1e-4);
      });
      // Tagmaat 3,25 in = het zwarte vierkant (8 van de 10 cellen van de officiële afbeelding).
      const g = id('mjOBJ_GEOM', `apriltag_geom_${spec.ids[0]}`);
      const size = Array.from(model.geom_size.slice(g * 3, g * 3 + 3));
      for (const k of [0, 1]) assert.ok(Math.abs(2 * size[k] * 0.8 - 3.25 * INCH) < 1e-4, `${key} zwart vierkant ${size}`);
      // SDK-oorsprong p_k − R_c·m_k (R_c = [r, −u, −n]) ≈ midden CELL-opening; gedrukt-boven wijst ernaartoe.
      const [, my, mz] = BIOBUZZ_CLUSTER_MEMBER_OFFSETS_M[0];
      const origin = mean.map((v, i) => v + u[i] * my + n[i] * mz);
      const b = id('mjOBJ_BODY', `${key}_shell`);
      const m = data.xmat.slice(b * 9, b * 9 + 9);
      const p = bodyPos(`${key}_shell`);
      const s = CELL_SHELLS[key].open_sign * (CELL_OPEN_D / 2);
      const open = [p[0] + m[1] * s, p[1] + m[4] * s, p[2] + m[7] * s];
      const dist = Math.hypot(...sub(origin, open));
      assert.ok(dist < 0.04, `${key}: SDK-oorsprong ${(dist * 100).toFixed(1)} cm van de CELL-opening`);
      assert.ok(dot(u, sub(open, mean)) > 0.1, `${key}: gedrukt-boven wijst naar de opening`);
    }
  });
});
