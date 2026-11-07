/**
 * Getekende route (waypoints in veld-meters, wereldcoördinaten) -> segmenten en Blockly-XML.
 * Hoeken: graden, tegen de klok in positief, 0 = +X (wereld). IMU-heading = wereldhoek - startYaw.
 */

/** Normaliseer hoek naar (-180, 180]. */
export function normDeg(a) {
  let r = ((a % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

/**
 * @param {{x:number,y:number}[]} wps eerste = start
 * @param {number} startYawDeg wereld-yaw van de robot bij START (IMU 0)
 * @returns {{heading:number, worldHeading:number, turn:number, distance:number}[]}
 */
export function waypointSegments(wps, startYawDeg = 0) {
  const out = [];
  let cur = startYawDeg;
  for (let i = 1; i < wps.length; i++) {
    const dx = wps[i].x - wps[i - 1].x, dy = wps[i].y - wps[i - 1].y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-3) continue;
    const world = (Math.atan2(dy, dx) * 180) / Math.PI;
    out.push({
      worldHeading: world,
      heading: normDeg(world - startYawDeg),
      turn: normDeg(world - cur),
      distance,
    });
    cur = world;
  }
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

let idSeq = 0;
const bid = () => `rw${Date.now().toString(36)}_${idSeq++}`;
const num = (v) => `<block type="math_number" id="${bid()}"><field name="NUM">${v}</field></block>`;

function callTurn(h) {
  return `<block type="procedures_callnoreturn" id="${bid()}"><mutation name="turnToHeading"><arg name="targetHeading"/></mutation><value name="ARG0">${num(h)}</value>`;
}
function callDrive(m, h, p) {
  return `<block type="procedures_callnoreturn" id="${bid()}"><mutation name="driveStraight"><arg name="meters"/><arg name="targetHeading"/><arg name="maxPower"/></mutation><value name="ARG0">${num(m)}</value><value name="ARG1">${num(h)}</value><value name="ARG2">${num(p)}</value>`;
}

/**
 * Bouw een functie `name` (procedures_defnoreturn) die per segment turnToHeading(h) en
 * driveStraight(m, h, power) aanroept (de bestaande ImuHiveAuto-helpers).
 */
export function routeToBlocksXml(segments, { name = 'gevolgdeRoute', x = 0, y = 0, power = 0.5 } = {}) {
  const stmts = [];
  for (const s of segments) {
    const h = r1(s.heading);
    stmts.push(callTurn(h));
    stmts.push(callDrive(r2(s.distance), h, power));
  }
  let chain = '';
  for (let i = stmts.length - 1; i >= 0; i--) {
    chain = stmts[i] + (chain ? `<next>${chain}</next>` : '') + '</block>';
  }
  const comment = `Getekende route (${segments.length} segmenten). Roep aan vanuit runOpMode na waitForStart.`;
  return `<xml xmlns="https://developers.google.com/blockly/xml"><block type="procedures_defnoreturn" id="${bid()}" x="${Math.round(x)}" y="${Math.round(y)}"><field name="NAME">${name}</field><comment pinned="false" h="80" w="400">${comment}</comment>${chain ? `<statement name="STACK">${chain}</statement>` : ''}</block></xml>`;
}

export const REQUIRED_HELPERS = ['turnToHeading', 'driveStraight'];
