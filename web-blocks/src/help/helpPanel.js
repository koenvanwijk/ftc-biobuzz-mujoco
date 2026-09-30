/**
 * Help-paneel: overlay (modal) dat los van de werkbalk en de simulatie zweeft.
 * - Opent met de Help-knop (#btnHelp), sluit met Esc, ✕ of klik naast het venster.
 * - `position: fixed` → geen invloed op de werkbalk-layout; de sim blijft draaien.
 * - Toetsen gaan niet naar de sim zolang het paneel open is (anders rijdt de robot
 *   weg terwijl je de tekst leest); Esc en Tab werken gewoon.
 */
import { getSections, renderHelpHtml, sectionAnchor } from './helpContent.js';

export function initHelpPanel({ button = document.getElementById('btnHelp'), doc = document } = {}) {
  if (!button) return { open() {}, close() {}, isOpen: () => false, destroy() {} };

  let overlay = null;
  let lastFocus = null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') e.stopPropagation(); // niet naar sim/gamepad-handlers
  };

  function build() {
    const el = doc.createElement('div');
    el.id = 'helpOverlay';
    el.className = 'help-overlay';
    el.hidden = true;
    el.innerHTML = `
      <div class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="helpTitle" tabindex="-1">
        <header class="help-header">
          <h1 id="helpTitle">Help</h1>
          <button type="button" class="help-close" id="btnHelpClose" aria-label="Sluiten" title="Sluiten (Esc)">✕</button>
        </header>
        <div class="help-body" id="helpBody"></div>
      </div>`;
    el.addEventListener('mousedown', (e) => {
      if (e.target === el) close();
    });
    el.querySelector('#btnHelpClose').addEventListener('click', close);
    el.querySelector('#helpBody').addEventListener('click', (e) => {
      const a = e.target.closest?.('[data-help-link]');
      if (!a) return;
      e.preventDefault();
      const target = el.querySelector(`#${sectionAnchor(a.dataset.helpLink)}`);
      target?.scrollIntoView({ block: 'start' });
    });
    doc.body.appendChild(el);
    return el;
  }

  function open() {
    if (!overlay) overlay = build();
    // Opnieuw renderen bij elke keer openen: secties die afhangen van de pagina (debugger) blijven kloppen.
    overlay.querySelector('#helpBody').innerHTML = renderHelpHtml(getSections(doc));
    lastFocus = doc.activeElement;
    overlay.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    overlay.querySelector('.help-body').scrollTop = 0;
    overlay.querySelector('.help-dialog').focus({ preventScroll: true });
    window.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    window.removeEventListener('keydown', onKeyDown, true);
    try {
      (lastFocus && lastFocus !== doc.body ? lastFocus : button).focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  const isOpen = () => !!overlay && !overlay.hidden;
  const onButton = () => (isOpen() ? close() : open());
  button.addEventListener('click', onButton);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');

  return {
    open,
    close,
    isOpen,
    destroy() {
      close();
      button.removeEventListener('click', onButton);
      overlay?.remove();
      overlay = null;
    },
  };
}
