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

describe('HIVE passages between all posts', () => {
  for (const name of scenes) {
    it(`keeps four legs and the raised crossbar as frame colliders: ${name}`, () => {
      const xml = read(name).toString();
      assert.doesNotMatch(xml, /hive_frame_base_/);
      const colliders = [...xml.matchAll(/<geom\b[^>]*name="(hive_frame_[^"]+_col)"[^>]*\/>/g)];
      assert.deepEqual(colliders.map((m) => m[1]).sort(), [
        'hive_frame_crossbar_col', 'hive_frame_leg_ne_col', 'hive_frame_leg_nw_col',
        'hive_frame_leg_se_col', 'hive_frame_leg_sw_col',
      ]);
      for (const [geom] of colliders) {
        assert.match(geom, /type="capsule"/);
        assert.match(geom, /contype="1" conaffinity="1"/);
      }
      assert.match(xml, /name="hive_frame_crossbar_col"[^>]*fromto="-0.60000 0.00000 1.13150 0.60000 0.00000 1.13150"/);
      assert.match(xml, /name="hive_frame_vis"[^>]*contype="0" conaffinity="0"/);
    });
  }

  it('keeps the scene generator free of floor beams', () => {
    assert.doesNotMatch(read('ftc_sim/scene.py').toString(), /base_neg_x|base_pos_x|plate_h|plate_t/);
  });

  it('has no visual floor beam in either short-end opening (all mesh copies)', () => {
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
