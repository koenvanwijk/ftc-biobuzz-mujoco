/**
 * Score-paneel (BIOBUZZ, Competition Manual TU03 §10.5, Table 10-2/10-3): pure HTML-opbouw +
 * kleine DOM-binding. De score zelf komt uit adapter.getScore() (worlds/biobuzz/scoring.js).
 */

/** Rijen: [sleutel, label, tooltip]. Labels in het Nederlands; spelbegrippen zoals in de manual. */
export const SCORE_ROWS = [
  ['tips', 'HIVE TIP ×20', 'Elke TIP van de eigen HIVE (live), 20 punten (AUTO en TELEOP).'],
  ['cell', 'In CELL ×2', 'POLLEN/NECTAR die stil in de omhoog-CELL van de eigen HIVE ligt (§10.5.1).'],
  ['flower', 'BLOEM eigenaar ×2', 'Alle elementen in een FLOWER waarvan je de bovenste NECTAR hebt (§10.5.2).'],
  ['bottomNectar', 'Onderste NECTAR +5', 'Per FLOWER: de alliantie met de onderste scorende NECTAR (§10.5.2).'],
  ['garden', 'GARDEN ×1', 'POLLEN/NECTAR (deels) in de eigen GARDEN, in rust (§10.5.3).'],
  ['leave', 'LEAVE* +3', 'Indicatief: robot raakt de muur niet meer (eenmaal gehaald blijft staan tot Reset sim). Zonder klok niet gekoppeld aan het einde van AUTO.'],
  ['park', 'PARK* (nu) +5', 'Indicatief: "als nu geparkeerd" — robot nu (deels) in de eigen LOADING ZONE (TELEOP PARK). AUTO PARK (+5) vraagt een klok en telt niet mee.'],
];

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function cell(row, cls) {
  if (!row) return `<td class="${cls}">–</td>`;
  const n = row.n ?? 0;
  return `<td class="${cls}">${row.pts}${n ? ` <small>(${n})</small>` : ''}</td>`;
}

/** @param {any} score  uitvoer van BiobuzzScorer.score() */
export function scoreRowsHtml(score) {
  if (!score?.red || !score?.blue) return '';
  const { red, blue } = score;
  const out = [];
  for (const [key, label, tip] of SCORE_ROWS) {
    out.push(`<tr title="${esc(tip)}"><td>${esc(label)}</td>${cell(red[key], 'sc-red')}${cell(blue[key], 'sc-blue')}</tr>`);
  }
  out.push(`<tr class="score-total"><td>Totaal</td><td class="sc-red">${red.total}</td><td class="sc-blue">${blue.total}</td></tr>`);
  const rp = (a, k) => {
    const r = a.rp[k];
    return `<span class="${r.earned ? 'rp-yes' : ''}">${r.value}/${r.threshold}${r.earned ? ' ✓' : ''}</span>`;
  };
  out.push(
    `<tr class="score-rp" title="SWARM RP (Table 10-3): LEAVE + PARK samen ≥ 16 punten. Indicatief; met één robot is het maximum hier 8 (LEAVE + TELEOP PARK)."><td>SWARM* RP</td><td>${rp(red, 'swarm')}</td><td>${rp(blue, 'swarm')}</td></tr>`,
  );
  out.push(
    `<tr class="score-rp" title="POLLINATOR 1 RP bij ≥ 4 TIPS, POLLINATOR 2 RP bij ≥ 7 TIPS (Table 10-3)."><td>POLLINATOR RP</td><td>${rp(red, 'pollinator1')} ${rp(red, 'pollinator2')}</td><td>${rp(blue, 'pollinator1')} ${rp(blue, 'pollinator2')}</td></tr>`,
  );
  return out.join('');
}

/** Voetnoot onder de tabel. */
export function scoreNoteText(score) {
  const base = '* indicatief: nog geen wedstrijdklok (geen AUTO PARK, WIN/TIE of fouten)';
  if (score && score.settled === false) return `${base} · ${score.moving} in beweging, telt na stilliggen`;
  return base;
}

/**
 * Bind het paneel: inklappen, positie onder de HUD, automatisch ingeklapt als het simbeeld smal is.
 * @returns {{ update(score:any): void, show(): void }}
 */
export function initScorePanel({ panel, toggle, rows, note, sumRed, sumBlue, hud }) {
  let userChoice = null; // null = automatisch, anders true/false (ingeklapt)
  const setCollapsed = (c) => {
    panel.classList.toggle('is-collapsed', c);
    toggle.setAttribute('aria-expanded', String(!c));
  };
  toggle.addEventListener('click', () => {
    userChoice = !panel.classList.contains('is-collapsed');
    setCollapsed(userChoice);
  });
  let lastNarrow = null;
  const place = () => {
    if (hud && !hud.hidden) panel.style.top = `${hud.offsetTop + hud.offsetHeight + 6}px`;
    const host = panel.parentElement;
    if (!host) return;
    // Smal/laag simpaneel: automatisch ingeklapt (anders botst het met het camerabeeld rechtsboven).
    // Een eigen keuze geldt tot het paneel van smal naar breed (of omgekeerd) wisselt.
    const narrow = host.clientWidth < 460 || host.clientHeight < 360;
    const tiny = host.clientWidth < 300; // camerabeeld vult dan bijna de hele breedte: alleen HUD-totalen
    if (narrow !== lastNarrow) userChoice = null;
    lastNarrow = narrow;
    setCollapsed(userChoice == null ? narrow : userChoice);
    panel.classList.toggle('is-tiny', tiny);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(place);
    if (hud) ro.observe(hud);
    if (panel.parentElement) ro.observe(panel.parentElement);
  }
  let lastHtml = '';
  let lastT = 0;
  return {
    show() {
      panel.hidden = false;
      place();
    },
    update(score, { force = false } = {}) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!force && now - lastT < 200) return; // ±5 Hz is genoeg en spaart DOM-werk
      lastT = now;
      if (!score?.red) return;
      sumRed.textContent = String(score.red.total);
      sumBlue.textContent = String(score.blue.total);
      const html = scoreRowsHtml(score);
      if (html !== lastHtml) {
        rows.innerHTML = html;
        lastHtml = html;
      }
      note.textContent = scoreNoteText(score);
    },
  };
}
