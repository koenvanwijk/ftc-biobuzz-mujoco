import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { flowerVertexColors, classifyFlowerPart, FLOWER_COLORS } from '../../src/worlds/biobuzz/flowerColors.js';

/** Binaire STL -> gededupliceerde vertices (zoals MuJoCo) + indices. */
function loadStl(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const map = new Map(); const xyz = []; const idx = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const o = 84 + 50 * i + 12 + 12 * k;
      const v = [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)];
      const key = v.map((c) => c.toFixed(5)).join(',');
      if (!map.has(key)) { map.set(key, xyz.length / 3); xyz.push(...v); }
      idx.push(map.get(key));
    }
  }
  return { xyz, idx };
}

describe('FLOWER-kleuren', () => {
  const { xyz, idx } = loadStl(new URL('../../public/assets/meshes/flower_pos_y.stl', import.meta.url));
  const z = xyz.filter((_, i) => i % 3 === 2);
  const { colors, parts } = flowerVertexColors(z, idx);
  const zmax = Math.max(...z);

  it('alle categorieën komen voor', () => {
    const seen = new Set(parts);
    for (const k of ['rod', 'topRing', 'handle', 'black', 'silver']) assert.ok(seen.has(k), k);
    assert.equal(colors.length, z.length * 3);
  });
  it('staven groen, top oranje, handvat paars, onderkant zilver', () => {
    const at = (pred) => parts.filter((_, i) => pred(i));
    const zr = (i) => z[i];
    // Middenhoogte (0.2–0.28 m): alleen de groene staven.
    assert.ok(at((i) => zr(i) > 0.2 && zr(i) < 0.28).every((p) => p === 'rod'));
    assert.ok(at((i) => zr(i) > 0.569).every((p) => p === 'handle'));
    assert.ok(at((i) => zr(i) > 0.518 && zr(i) < 0.545).includes('topRing'));
    assert.ok(at((i) => zr(i) < 0.0).every((p) => p === 'silver'));
    assert.ok(at((i) => zr(i) > 0.292 && zr(i) < 0.3).includes('black'), 'zijplankje zwart');
    assert.ok(zmax > 0.57);
  });
  it('classifyFlowerPart grenzen', () => {
    assert.equal(classifyFlowerPart(0.2, 0.9), 'rod');
    assert.equal(classifyFlowerPart(0.97, 1), 'handle');
    assert.equal(classifyFlowerPart(0.9, 0.95), 'topRing');
    assert.equal(classifyFlowerPart(0.2, 0.25), 'black');
    assert.equal(classifyFlowerPart(0, 0.03), 'silver');
    assert.deepEqual(FLOWER_COLORS.rod, [0.2, 0.55, 0.22]);
  });
  it('geen paarse buis in de scene-kopieën en scene.py', () => {
    for (const p of ['../../public/assets/biobuzz_scene.xml', '../../../web/assets/biobuzz_scene.xml', '../../../web/public/assets/biobuzz_scene.xml', '../../../ftc_sim/assets/biobuzz_scene.xml', '../../../ftc_sim/scene.py']) {
      assert.doesNotMatch(fs.readFileSync(new URL(p, import.meta.url), 'utf8'), /tube_vis/, p);
    }
  });
});
