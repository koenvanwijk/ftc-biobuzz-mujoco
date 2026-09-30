/**
 * Help-sectie: toetsenbord → gamepad.
 * Bron van waarheid in de code:
 *   idle:   src/worlds/biobuzz/controls.js  (InputHandler)
 *   OpMode: src/main.js                     (applyKeys)
 * tests/unit/helpContent.test.js bewaakt dat de toetsen in main.js voorkomen.
 */

/** Toetsen die tijdens een OpMode worden doorgegeven (spiegelt applyKeys in main.js). */
export const OPMODE_KEYS = [
  { keys: ['W', 'S'], target: '<code>leftStickY</code>', note: 'W = −1 (omhoog), S = +1 (omlaag)' },
  { keys: ['I', 'K', '↑', '↓'], target: '<code>rightStickY</code>', note: 'I / ↑ = −1, K / ↓ = +1' },
  { keys: ['←', '→'], target: '<code>leftStickX</code>', note: '← = −1, → = +1' },
  { keys: ['E'], target: '<code>RightBumper</code>', note: '' },
  { keys: ['C'], target: '<code>LeftBumper</code>', note: '' },
  { keys: ['Space', 'F'], target: '<code>rightTrigger</code> = 1', note: '' },
  { keys: ['X'], target: 'knop <code>X</code>', note: '' },
  { keys: ['G'], target: 'knop <code>A</code>', note: 'let op: G, niet A' },
  { keys: ['B'], target: 'knop <code>B</code>', note: '' },
  { keys: ['Y'], target: 'knop <code>Y</code>', note: '' },
  { keys: ['U'], target: '<code>DpadUp</code>', note: '' },
  { keys: ['J'], target: '<code>DpadDown</code>', note: '' },
  { keys: ['H'], target: '<code>DpadLeft</code>', note: '' },
  { keys: ['L'], target: '<code>DpadRight</code>', note: '' },
];

/** Toetsen in idle teleop (geen OpMode actief, spiegelt InputHandler in controls.js). */
export const IDLE_KEYS = [
  { keys: ['W', 'S'], action: 'Linkerwiel vooruit / achteruit (tankbesturing)' },
  { keys: ['I', 'K', '↑', '↓'], action: 'Rechterwiel vooruit / achteruit (tankbesturing; I en ↑ = vooruit, K en ↓ = achteruit)' },
  { keys: ['A', 'D', '←', '→'], action: 'Bocht links / rechts. Zodra je een van deze vasthoudt schakelt de besturing tijdelijk naar <em>arcade</em>: W/↑ = gas, S/↓ = achteruit, A/← en D/→ = sturen' },
  { keys: ['T'], action: 'Schakelt arcade aan/uit (blijvend). In arcade werken I/K niet meer voor het rechterwiel' },
  { keys: ['E'], action: 'Intake aan/uit (begint <em>aan</em>)' },
  { keys: ['C'], action: 'Vasthouden: achterste FIFO uitspugen (intake omgekeerd)' },
  { keys: ['Space', 'F'], action: 'Schieten (één schot per toetsaanslag)' },
  { keys: ['X'], action: 'Nectar uit de achterste FIFO op een bloem plaatsen' },
  { keys: ['R'], action: 'Robot terug naar de startpositie (keyframe)' },
];

const kbd = (keys) => keys.map((k) => `<kbd>${k}</kbd>`).join(' ');

function idleRows() {
  return IDLE_KEYS.map((r) => `<tr><td>${kbd(r.keys)}</td><td>${r.action}</td></tr>`).join('\n');
}

function opModeRows() {
  return OPMODE_KEYS.map(
    (r) => `<tr><td>${kbd(r.keys)}</td><td>${r.target}${r.note ? ` <span class="muted">(${r.note})</span>` : ''}</td></tr>`,
  ).join('\n');
}

export default {
  id: 'sneltoetsen',
  title: 'Sneltoetsen',
  html: `
<p>Het toetsenbord werkt op de hele pagina, behalve als de cursor in de Blocks-editor (iframe) staat. Klik dus eerst op de simulatie of een lege plek. Een aangesloten fysieke gamepad werkt ook. In idle teleop vervangt die de rij-toetsen (W/S/I/K/A/D/pijltjes) en de C-toets; E, Space/F, X, T en R blijven werken.</p>

<h3>Idle: geen OpMode actief</h3>
<p>Voor INIT, na STOP/DONE/ERROR en na Reset sim. Hier bestuurt de standaard BIOBUZZ-teleop de robot direct (HUD: Control = Teleop).</p>
<table class="help-table">
  <thead><tr><th>Toets</th><th>Actie</th></tr></thead>
  <tbody>
${idleRows()}
  </tbody>
</table>

<h3>Tijdens een OpMode (INIT, WAIT_FOR_START, RUN)</h3>
<p>Nu is de teleop uit en vertalen de toetsen naar <code>gamepad1</code>. Jouw blokken lezen die waarden. De robot doet dus alleen wat je blokken ermee doen. Bij STOP, DONE, ERROR of Reset sim worden alle toets-overrides gewist.</p>
<table class="help-table">
  <thead><tr><th>Toets</th><th>gamepad1</th></tr></thead>
  <tbody>
${opModeRows()}
  </tbody>
</table>
<p class="help-note">Verschillen met idle: <kbd>A</kbd> en <kbd>D</kbd> doen tijdens een OpMode niets, <kbd>T</kbd> en <kbd>R</kbd> sturen de OpMode niet aan, en <kbd>W</kbd> en <kbd>S</kbd> zijn de <em>linker</em> stick (Y-as). Pijltjes omhoog/omlaag en Space worden niet meer door de browser gescrold.</p>
<p>Je kunt ook de virtuele gamepad in het Sim-paneel gebruiken (L↑ L↓ = <code>leftStickY</code>, R↑ R↓ = <code>rightStickY</code>, ingedrukt houden).</p>
`,
};
