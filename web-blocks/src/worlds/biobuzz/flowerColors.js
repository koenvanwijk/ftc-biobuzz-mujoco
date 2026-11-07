/**
 * Kleuren voor de FLOWER-mesh (één STL zonder materiaalgroepen), naar de officiële render.
 * De mesh bestaat uit losse delen (verbonden componenten); elk deel krijgt een kleur op basis
 * van zijn hoogte-bereik t.o.v. de hele FLOWER (wereld-z, dus onafhankelijk van MuJoCo's mesh-frame).
 */
export const FLOWER_COLORS = {
  rod: [0.2, 0.55, 0.22], // groene verticale staven
  topRing: [0.95, 0.62, 0.12], // oranje/gouden bovenring
  handle: [0.5, 0.26, 0.68], // paars handvat
  black: [0.07, 0.07, 0.08], // zwarte ringen, beugel/plankje
  silver: [0.76, 0.77, 0.8], // grondplaat en metalen voet
};

/** Deel-categorie uit relatieve hoogtes (0 = onderkant, 1 = bovenkant FLOWER). */
export function classifyFlowerPart(z0, z1) {
  if (z1 - z0 > 0.5) return 'rod';
  if (z0 > 0.95) return 'handle';
  if (z0 > 0.85) return 'topRing';
  if (z0 > 0.4) return 'black'; // zijplankje/beugel halverwege
  if (z1 < 0.06) return 'silver'; // grondplaat
  if (z0 < 0.08 && z1 < 0.25) return 'silver'; // metalen voet
  return 'black'; // middel-/onderringen
}

/** Verbonden componenten van een geïndexeerde mesh -> component-id per vertex. */
export function vertexComponents(vertCount, indices) {
  const p = new Int32Array(vertCount).map((_, i) => i);
  const find = (a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  for (let f = 0; f < indices.length; f += 3) {
    const a = find(indices[f]);
    for (let k = 1; k < 3; k++) { const b = find(indices[f + k]); if (a !== b) p[b] = a; }
  }
  const out = new Int32Array(vertCount);
  for (let i = 0; i < vertCount; i++) out[i] = find(i);
  return out;
}

/**
 * @param {ArrayLike<number>} worldZ wereld-z per vertex
 * @param {ArrayLike<number>} indices driehoeken
 * @returns {{colors: Float32Array, parts: string[]}} RGB per vertex + categorie per vertex
 */
export function flowerVertexColors(worldZ, indices) {
  const n = worldZ.length;
  const comp = vertexComponents(n, indices);
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < n; i++) { zmin = Math.min(zmin, worldZ[i]); zmax = Math.max(zmax, worldZ[i]); }
  const H = zmax - zmin || 1;
  const range = new Map();
  for (let i = 0; i < n; i++) {
    const r = range.get(comp[i]) || [Infinity, -Infinity];
    r[0] = Math.min(r[0], worldZ[i]); r[1] = Math.max(r[1], worldZ[i]);
    range.set(comp[i], r);
  }
  const cat = new Map();
  for (const [c, [a, b]] of range) cat.set(c, classifyFlowerPart((a - zmin) / H, (b - zmin) / H));
  const colors = new Float32Array(n * 3);
  const parts = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = cat.get(comp[i]);
    parts[i] = k;
    colors.set(FLOWER_COLORS[k], i * 3);
  }
  return { colors, parts };
}
