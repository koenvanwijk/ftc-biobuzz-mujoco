/**
 * Help-inhoud (Nederlands). Elke sectie staat in een eigen bestand in ./sections.
 * Een sectie is { id, title, html, isAvailable?(doc) }.
 *
 * - Volgorde hieronder = volgorde in de inhoudsopgave.
 * - Een sectie met `isAvailable` wordt alleen getoond als die functie true geeft
 *   (de debugger-sectie controleert of #btnDebug bestaat).
 * - Pure functies, geen DOM nodig → testbaar met `node --test`.
 */
import panelen from './sections/panelen.js';
import knoppen from './sections/knoppen.js';
import sneltoetsen from './sections/sneltoetsen.js';
import blokken from './sections/blokken.js';
import debuggerSection from './sections/debugger.js';
import voorbeeld from './sections/voorbeeld.js';

/** Alle secties, in weergavevolgorde. */
export const ALL_SECTIONS = [panelen, knoppen, sneltoetsen, blokken, debuggerSection, voorbeeld];

export const sectionAnchor = (id) => `help-${id}`;

/** Secties die nu getoond worden (filtert op `isAvailable`). */
export function getSections(doc = globalThis.document, sections = ALL_SECTIONS) {
  return sections.filter((s) => (typeof s.isAvailable === 'function' ? !!s.isAvailable(doc) : true));
}

/** Inhoudsopgave als HTML. */
export function renderToc(sections) {
  const items = sections
    .map((s, i) => `<li><a href="#${sectionAnchor(s.id)}" data-help-link="${s.id}">${i + 1}. ${s.title}</a></li>`)
    .join('');
  return `<nav class="help-toc" aria-label="Inhoudsopgave"><ol>${items}</ol></nav>`;
}

/**
 * Links naar secties die (nu) niet bestaan worden gewone tekst, zodat er geen dode links zijn
 * (bv. de verwijzing naar Debugger als die sectie verborgen is).
 */
export function dropDeadLinks(html, sections) {
  const ids = new Set(sections.map((s) => s.id));
  return html.replace(/<a href="#help-[^"]*" data-help-link="([^"]*)">([\s\S]*?)<\/a>/g, (m, id, inner) =>
    ids.has(id) ? m : inner,
  );
}

/** Volledige inhoud (TOC + secties) als HTML-string. */
export function renderHelpHtml(sections = getSections()) {
  const body = sections
    .map(
      (s) =>
        `<section class="help-section" id="${sectionAnchor(s.id)}" data-help-section="${s.id}">` +
        `<h2>${s.title}</h2>${dropDeadLinks(s.html, sections)}</section>`,
    )
    .join('\n');
  return `${renderToc(sections)}<div class="help-sections">${body}</div>`;
}
