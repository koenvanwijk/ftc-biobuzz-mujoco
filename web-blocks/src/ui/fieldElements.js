/**
 * Statische veldelementen voor de route-plot, uit de scene-XML (biobuzz_scene.xml) gelezen.
 * En de afbeelding MuJoCo-wereld <-> officieel FTC Field Coordinate System.
 *
 * Sim-wereld: rode alliantie-muur = -X, publiek (audience) = -Y, blauw = +X.
 * FTC (ftc-docs "Field Coordinate System Definition"): oorsprong in het veldmidden; gezien vanaf de
 * Red Wall loopt +Y van de Red Wall af (naar blauw) en +X naar rechts. Rood zit hier links van het
 * publiek ("inverted", zoals DECODE), dus +X_ftc wijst naar het publiek.
 *   X_ftc = -y_sim,  Y_ftc = x_sim,  heading_ftc = heading_sim + 90°
 */

export function worldToFtc(x, y) { return { x: -y, y: x }; }
export function ftcToWorld(X, Y) { return { x: Y, y: -X }; }
export function worldYawToFtcDeg(yawDeg) {
  let r = (((yawDeg + 90) % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

const nums = (s) => s.trim().split(/\s+/).map(Number);
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

/**
 * @param {string} xml scene-XML
 * @returns {{starts:{alliance:string,x:number,y:number,yawDeg:number,hx:number,hy:number}[],
 *   flowers:{name:string,x:number,y:number,r:number}[], posts:{name:string,x:number,y:number,r:number,alliance:string|null}[]}}
 */
export function parseFieldElements(xml) {
  const flowers = [];
  for (const m of xml.matchAll(/<geom\s[^>]*name="(flower_[a-z_]+)_floor"[^>]*>/g)) {
    const [x, y] = nums(attr(m[0], 'pos'));
    flowers.push({ name: m[1], x, y, r: nums(attr(m[0], 'size'))[0] });
  }
  const posts = [];
  for (const m of xml.matchAll(/<geom\s[^>]*name="hive_frame_leg_(\w+?)_col"[^>]*>/g)) {
    const f = nums(attr(m[0], 'fromto'));
    // Voetpunt = het uiteinde met de laagste z.
    const [x, y] = f[2] <= f[5] ? [f[0], f[1]] : [f[3], f[4]];
    posts.push({ name: m[1], x, y, r: nums(attr(m[0], 'size'))[0] });
  }
  // HIVE-alliantie: middelpunt van de CELL-shells per kleur (bodies red_*_shell / blue_*_shell in
  // hive_red / hive_blue); elke paalvoet krijgt de kleur van de dichtstbijzijnde HIVE.
  const hives = {};
  for (const color of ['red', 'blue']) {
    const ps = [...xml.matchAll(new RegExp(`<body\\s[^>]*name="${color}_\\w+_shell"[^>]*>`, 'g'))].map((m) => nums(attr(m[0], 'pos')));
    if (ps.length) hives[color] = { x: ps.reduce((a, p) => a + p[0], 0) / ps.length, y: ps.reduce((a, p) => a + p[1], 0) / ps.length };
  }
  for (const p of posts) {
    let best = null, bd = Infinity;
    for (const [c, h] of Object.entries(hives)) {
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d < bd) { bd = d; best = c; }
    }
    p.alliance = best;
  }
  const starts = [];
  const rb = xml.match(/<body\s[^>]*name="robot"[^>]*>[\s\S]*?<geom\s[^>]*name="bumper"[^>]*>/);
  if (rb) {
    const bodyTag = rb[0].match(/<body\s[^>]*>/)[0];
    const [x, y] = nums(attr(bodyTag, 'pos'));
    const eul = attr(bodyTag, 'euler');
    const yawDeg = eul ? nums(eul)[2] : 0;
    const bumper = rb[0].match(/<geom\s[^>]*name="bumper"[^>]*>/)[0];
    const [hx, hy] = nums(attr(bumper, 'size'));
    const alliance = x <= 0 ? 'red' : 'blue';
    starts.push({ alliance, x, y, yawDeg, hx, hy });
    // Andere alliantie: puntsymmetrisch gespiegeld (zoals LOADING ZONEs/FLOWERs in de scene).
    starts.push({ alliance: alliance === 'red' ? 'blue' : 'red', x: -x, y: -y, yawDeg: yawDeg + 180, hx, hy });
  }
  return { starts, flowers, posts };
}
