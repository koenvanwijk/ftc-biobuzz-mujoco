import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ALL_SECTIONS,
  getSections,
  renderToc,
  renderHelpHtml,
  dropDeadLinks,
  sectionAnchor,
} from '../../src/help/helpContent.js';
import debuggerSection, { isAvailable, DEBUGGER_FORCE } from '../../src/help/sections/debugger.js';
import { IDLE_KEYS, OPMODE_KEYS } from '../../src/help/sections/sneltoetsen.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const docWith = (ids) => ({ getElementById: (id) => (ids.includes(id) ? {} : null) });
const docWithDebugger = docWith(['btnDebug']);
const docWithoutDebugger = docWith([]);

describe('Help content sections', () => {
  it('has the six required sections in order', () => {
    assert.deepEqual(
      ALL_SECTIONS.map((s) => s.id),
      ['panelen', 'knoppen', 'sneltoetsen', 'blokken', 'debugger', 'voorbeeld'],
    );
  });

  it('has unique, url-safe ids and non-empty titles', () => {
    const ids = ALL_SECTIONS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of ALL_SECTIONS) {
      assert.match(s.id, /^[a-z][a-z0-9-]*$/);
      assert.ok(s.title.trim().length > 0, `${s.id} title`);
    }
  });

  it('has no empty sections', () => {
    for (const s of ALL_SECTIONS) {
      assert.ok(textOf(s.html).length > 200, `section ${s.id} should have real content`);
    }
  });

  it('has balanced common HTML tags per section', () => {
    for (const s of ALL_SECTIONS) {
      for (const tag of ['table', 'thead', 'tbody', 'tr', 'ul', 'ol', 'li', 'p', 'h3', 'code', 'kbd', 'strong', 'em']) {
        const open = (s.html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
        const close = (s.html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        assert.equal(open, close, `<${tag}> balance in ${s.id}`);
      }
    }
  });
});

describe('Help table of contents', () => {
  it('every TOC link resolves to a rendered section id', () => {
    const sections = getSections(docWithDebugger);
    const html = renderHelpHtml(sections);
    const hrefs = [...renderToc(sections).matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.equal(hrefs.length, sections.length);
    for (const h of hrefs) assert.ok(html.includes(`id="${h}"`), `missing target ${h}`);
  });

  it('every rendered section is in the TOC and ids in the DOM are unique', () => {
    const sections = getSections(docWithDebugger);
    const html = renderHelpHtml(sections);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of sections) assert.ok(renderToc(sections).includes(`#${sectionAnchor(s.id)}`));
  });

  it('in-text section links only point to existing sections (dead links become plain text)', () => {
    for (const doc of [docWithDebugger, docWithoutDebugger]) {
      const sections = getSections(doc);
      const html = renderHelpHtml(sections);
      const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
      for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), `dead link ${m[1]}`);
    }
  });

  it('dropDeadLinks keeps live links and unwraps dead ones', () => {
    const html = '<a href="#help-a" data-help-link="a">A</a> <a href="#help-x" data-help-link="x">X</a>';
    assert.equal(dropDeadLinks(html, [{ id: 'a' }]), '<a href="#help-a" data-help-link="a">A</a> X');
  });
});

describe('Debugger section flag', () => {
  it('is auto-detected (no forced value)', () => {
    assert.equal(DEBUGGER_FORCE, null);
  });

  it('is included only when #btnDebug exists', () => {
    assert.equal(isAvailable(docWithDebugger), true);
    assert.equal(isAvailable(docWithoutDebugger), false);
    assert.ok(getSections(docWithDebugger).some((s) => s.id === 'debugger'));
    assert.ok(!getSections(docWithoutDebugger).some((s) => s.id === 'debugger'));
  });

  it('lives in its own file and works without a document', () => {
    assert.equal(debuggerSection.id, 'debugger');
    assert.equal(typeof debuggerSection.isAvailable, 'function');
    assert.equal(isAvailable(undefined), false);
  });

  it('mentions every debugger control', () => {
    const t = textOf(debuggerSection.html);
    for (const w of ['Debug', 'Stap over', 'Stap uit', 'Doorgaan', 'Pauzeer', 'Breakpoint', 'Wis BP', 'Variabelen']) {
      assert.ok(t.includes(w), w);
    }
  });

  it('debugger button ids documented here exist in index.html', () => {
    const html = read('index.html');
    for (const id of ['btnDebug', 'btnDbgStep', 'btnDbgStepOver', 'btnDbgStepOut', 'btnDbgContinue', 'btnDbgPause', 'btnDbgBreakpoint', 'btnDbgClearBp']) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
  });
});

describe('Help stays in sync with the app', () => {
  const all = textOf(ALL_SECTIONS.map((s) => s.html).join(' '));

  it('index.html has a Help button', () => {
    assert.match(read('index.html'), /<button id="btnHelp"[^>]*>Help<\/button>/);
  });

  it('documents every toolbar button label', () => {
    const html = read('index.html');
    const toolbar = html.slice(html.indexOf('<header class="toolbar">'), html.indexOf('</header>'));
    const labels = [...toolbar.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1].trim());
    assert.ok(labels.length >= 12);
    for (const l of labels) {
      const name = l.replace(/^●\s*/, '');
      assert.ok(all.includes(name), `Help mentions "${name}"`);
    }
  });

  it('documents every example in the dropdown', () => {
    const html = read('index.html');
    for (const m of html.matchAll(/<option value="StarterBot_(\w+)\.blk"/g)) {
      assert.ok(all.includes(m[1]), m[1]);
    }
  });

  it('opmode key table matches applyKeys in main.js', () => {
    const src = read('src/main.js');
    const fn = src.slice(src.indexOf('function applyKeys'));
    const expectations = [
      [/keys\.w\)\s*ly -= 1/, ['W']],
      [/keys\.s\)\s*ly \+= 1/, ['S']],
      [/keys\.i \|\| keys\.arrowup\)\s*ry -= 1/, ['I', '↑']],
      [/keys\.k \|\| keys\.arrowdown\)\s*ry \+= 1/, ['K', '↓']],
      [/keys\.arrowleft\)\s*lx -= 1/, ['←']],
      [/keys\.arrowright\)\s*lx \+= 1/, ['→']],
      [/'RightBumper', !!keys\.e/, ['E']],
      [/'LeftBumper', !!keys\.c/, ['C']],
      [/'X', !!keys\.x/, ['X']],
      [/'A', !!keys\.g/, ['G']],
      [/'B', !!keys\.b/, ['B']],
      [/'Y', !!keys\.y/, ['Y']],
      [/'DpadUp', !!keys\.u/, ['U']],
      [/'DpadDown', !!keys\.j/, ['J']],
      [/'DpadLeft', !!keys\.h/, ['H']],
      [/'DpadRight', !!keys\.l/, ['L']],
      [/shoot = space \|\| !!keys\.f/, ['Space', 'F']],
    ];
    const documented = new Set(OPMODE_KEYS.flatMap((r) => r.keys));
    for (const [re, keys] of expectations) {
      assert.match(fn, re);
      for (const k of keys) assert.ok(documented.has(k), `OpMode key ${k} documented`);
    }
    assert.equal(documented.size, 20); // geen extra, niet-bestaande toetsen gedocumenteerd
  });

  it('idle key table matches InputHandler in controls.js', () => {
    const src = read('src/worlds/biobuzz/controls.js');
    for (const re of [
      /down\('w'\)\) left \+= 1/,
      /down\('s'\)\) left -= 1/,
      /down\('i'\) \|\| down\('ArrowUp'\)\) right \+= 1/,
      /down\('k'\) \|\| down\('ArrowDown'\)\) right -= 1/,
      /down\('a'\) \|\| down\('ArrowLeft'\)/,
      /k === 't'/,
      /k === 'e'/,
      /down\('c'\)\) reverse = true/,
      /e\.code === 'Space' \|\| k === 'f'/,
      /k === 'x'/,
      /k === 'r'/,
    ]) {
      assert.match(src, re);
    }
    const documented = new Set(IDLE_KEYS.flatMap((r) => r.keys));
    for (const k of ['W', 'S', 'I', 'K', '↑', '↓', 'A', 'D', '←', '→', 'T', 'E', 'C', 'Space', 'F', 'X', 'R']) {
      assert.ok(documented.has(k), `idle key ${k} documented`);
    }
  });

  it('mentions out-of-scope vision features', () => {
    assert.match(all, /TFOD/);
    assert.match(all, /Vuforia/);
  });

  it('README mentions Help', () => {
    assert.match(read('README.md'), /\*\*Help\*\*/);
  });
});
