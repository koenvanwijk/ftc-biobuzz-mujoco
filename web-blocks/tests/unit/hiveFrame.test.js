import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const repo = new URL('../../../', import.meta.url);
const scenes = [
  'ftc_sim/assets/biobuzz_scene.xml',
  'web/assets/biobuzz_scene.xml',
  'web/public/assets/biobuzz_scene.xml',
  'web-blocks/public/assets/biobuzz_scene.xml',
];
const meshes = [
  'ftc_sim/assets/meshes/hive_frame.stl',
  'web/public/assets/meshes/hive_frame.stl',
  'web-blocks/public/assets/meshes/hive_frame.stl',
];
const read = (name) => fs.readFileSync(new URL(name, repo));

// Clip to the opening, not vertex bounds: long slanted-leg triangles reach floor
// level, but do not actually cross the space between the feet at that height.
function clip(poly, axis, limit, sign) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = sign * (a[axis] - limit), db = sign * (b[axis] - limit);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push(a.map((v, k) => v + t * (b[k] - v)));
    }
  }
  return result;
}

describe('HIVE frame: legs, raised crossbar and short-end base bars', () => {
  for (const name of scenes) {
    it(`has four legs, the raised crossbar and two base bars as frame colliders: ${name}`, () => {
      const xml = read(name).toString();
      const colliders = [...xml.matchAll(/<geom\b[^>]*name="(hive_frame_[^"]+_col)"[^>]*\/>/g)];
      assert.deepEqual(colliders.map((m) => m[1]).sort(), [
        'hive_frame_base_neg_x_col', 'hive_frame_base_pos_x_col',
        'hive_frame_crossbar_col', 'hive_frame_leg_ne_col', 'hive_frame_leg_nw_col',
        'hive_frame_leg_se_col', 'hive_frame_leg_sw_col',
      ]);
      for (const [geom] of colliders) {
        assert.match(geom, /type="(capsule|box)"/);
        assert.match(geom, /contype="1" conaffinity="1"/);
      }
      assert.match(xml, /name="hive_frame_crossbar_col"[^>]*fromto="-0.60000 0.00000 1.13150 0.60000 0.00000 1.13150"/);
      assert.match(xml, /name="hive_frame_vis"[^>]*contype="0" conaffinity="0"/);
    });

    it(`restores a visible + colliding base bar between the two feet at each short end: ${name}`, () => {
      const xml = read(name).toString();
      for (const [side, x] of [['neg_x', '-0.60000'], ['pos_x', '0.60000']]) {
        const box = `type="box" pos="${x} 0.00000 0.06500" size="0.02000 0.48000 0.03000"`;
        assert.match(xml, new RegExp(`name="hive_frame_base_${side}_col" ${box} rgba="0.5 0.5 0.5 0" contype="1" conaffinity="1" group="3"`));
        assert.match(xml, new RegExp(`name="hive_frame_base_${side}_vis" ${box} material="hive_mat" contype="0" conaffinity="0" group="1"`));
      }
    });
  }

  it('scene generator emits the short-end base bars', () => {
    const py = read('ftc_sim/scene.py').toString();
    assert.match(py, /base_neg_x/);
    assert.match(py, /base_pos_x/);
  });

  it('CAD frame mesh itself has no floor beam; the base bars are separate geoms (all mesh copies)', () => {
    const stl = read(meshes[0]);
    for (const name of meshes.slice(1)) assert.deepEqual(read(name), stl, name);
    const count = stl.readUInt32LE(80);
    assert.equal(stl.length, 84 + count * 50, 'binary STL layout');
    assert.ok(count > 0);
    for (let i = 0; i < count; i++) {
      const triangle = Array.from({ length: 3 }, (_, v) =>
        Array.from({ length: 3 }, (_, k) => stl.readFloatLE(84 + i * 50 + 12 + v * 12 + k * 4)));
      // Both x = ±0.6 post pairs, central y gap, floor-to-10 cm band.
      for (const x of [-0.6, 0.6]) {
        let poly = triangle;
        for (const [axis, limit, sign] of [
          [0, x - 0.05, 1], [0, x + 0.05, -1],
          [1, -0.4, 1], [1, 0.4, -1], [2, 0, 1], [2, 0.1, -1],
        ]) poly = clip(poly, axis, limit, sign);
        assert.equal(poly.length, 0, `triangle ${i} crosses floor opening at x=${x}`);
      }
    }
  });
});
