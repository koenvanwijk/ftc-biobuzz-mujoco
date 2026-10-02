import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockVarRefs, formatVarTooltip } from '../../src/editor/varHover.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Minimal Blockly-block stand-ins (duck-typed: inputList[].fieldRow[]).
const varField = (text, name = 'VAR') => ({ name, getText: () => text, getVariable: () => ({}) });
const plainField = (name, text) => ({ name, getText: () => text });
const block = (...fields) => ({ inputList: [{ fieldRow: fields }] });

describe('blockVarRefs (block → referenced variables)', () => {
  it('finds the VAR field of variables_get/set, math_change, for-loop counters', () => {
    assert.deepEqual(blockVarRefs(block(plainField('LABEL', 'set'), varField('totaal'))), [{ name: 'totaal', display: 'totaal' }]);
    assert.equal(blockVarRefs(block(varField('i'))).length, 1);
  });

  it('collects all variables in the hovered block own fields, unique, in order (also across inputs)', () => {
    const b = { inputList: [{ fieldRow: [varField('a')] }, { fieldRow: [plainField('X', 'foo'), varField('b'), varField('a')] }] };
    assert.deepEqual(blockVarRefs(b).map((r) => r.display), ['a', 'b']);
  });

  it('ignores non-variable fields and blocks without fields / null', () => {
    assert.deepEqual(blockVarRefs(block(plainField('NUM', '5'))), []);
    assert.deepEqual(blockVarRefs({ inputList: [] }), []);
    assert.deepEqual(blockVarRefs({}), []);
    assert.deepEqual(blockVarRefs(null), []);
  });

  it('maps display names to JS names via the callback and survives a throwing callback', () => {
    const toJs = (d) => (d === 'mijn var' ? 'mijn_var' : d);
    assert.deepEqual(blockVarRefs(block(varField('mijn var')), toJs), [{ name: 'mijn_var', display: 'mijn var' }]);
    assert.deepEqual(blockVarRefs(block(varField('x')), () => { throw new Error('x'); }), [{ name: 'x', display: 'x' }]);
  });
});

describe('formatVarTooltip (refs + snapshot → text)', () => {
  const vars = [
    { name: 'totaal', scope: 'globaal', text: '36' },
    { name: 'teller', scope: 'globaal', text: '15' },
    { name: 'mijn_var', scope: 'lokaal', text: '"bij"' },
  ];
  it('formats "naam = waarde", one line per variable', () => {
    assert.equal(formatVarTooltip([{ name: 'totaal', display: 'totaal' }], vars), 'totaal = 36');
    assert.equal(formatVarTooltip([{ name: 'totaal' }, { name: 'teller' }], vars), 'totaal = 36\nteller = 15');
  });
  it('falls back to the display name and shows the JS name found in the snapshot', () => {
    assert.equal(formatVarTooltip([{ name: 'nope', display: 'teller' }], vars), 'teller = 15');
    assert.equal(formatVarTooltip([{ name: 'mijn_var', display: 'mijn var' }], vars), 'mijn_var = "bij"');
  });
  it('unknown variable → "(niet beschikbaar)"; nothing to show → empty string', () => {
    assert.equal(formatVarTooltip([{ name: 'onbekend', display: 'onbekend' }], vars), 'onbekend = (niet beschikbaar)');
    assert.equal(formatVarTooltip([], vars), '');
    assert.equal(formatVarTooltip([{ name: 'totaal' }], null), '');
    assert.equal(formatVarTooltip(null, vars), '');
  });
  it('truncates long values and limits the number of lines', () => {
    const long = formatVarTooltip([{ name: 'x' }], [{ name: 'x', text: 'y'.repeat(1500) }]);
    assert.ok(long.length < 920 && long.endsWith('…'));
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `v${i}` }));
    const t = formatVarTooltip(many, many.map((m) => ({ name: m.name, text: '1' })), 3).split('\n');
    assert.equal(t.length, 4);
    assert.equal(t[3], '… (+7)');
  });
  it('works on the real Blockly-shaped snapshot the worker sends (JSON round trip)', () => {
    const snap = JSON.parse(JSON.stringify(vars));
    assert.equal(formatVarTooltip([{ name: 'teller' }], snap), 'teller = 15');
  });
});

describe('editor bridge + toolbar wiring', () => {
  const bridge = fs.readFileSync(path.join(root, 'src/editor/blocksBridge.js'), 'utf8');
  it('injects the pure helpers into the iframe and handles setDebugVars/highlightVarBlocks', () => {
    assert.match(bridge, /\$\{blockVarRefs\.toString\(\)\}/);
    assert.match(bridge, /\$\{formatVarTooltip\.toString\(\)\}/);
    assert.match(bridge, /case 'setDebugVars'/);
    assert.match(bridge, /case 'highlightVarBlocks'/);
  });
  it('helpers are self-contained (safe to inject via toString): no imports/refs to each other', () => {
    const src = fs.readFileSync(path.join(root, 'src/editor/varHover.js'), 'utf8');
    const fn = src.slice(src.indexOf('export function formatVarTooltip'));
    assert.ok(!/blockVarRefs/.test(fn));
    assert.ok(!/`/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no template literals (would break the injected string)');
  });
  it('status line is layout-neutral: own row, ellipsis, no width growth; full text in title', () => {
    const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
    const rule = css.match(/\.run-status\s*\{([\s\S]*?)\}/)[1];
    assert.match(rule, /min-width:\s*0/);
    assert.match(rule, /overflow:\s*hidden/);
    assert.match(rule, /text-overflow:\s*ellipsis/);
    assert.match(rule, /white-space:\s*nowrap/);
    assert.match(rule, /flex:\s*1 1 14rem/);
    const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
    assert.match(main, /el\.title = `\$\{full\}/);
    assert.ok(!/pausedText \+= ` · \$\{vt\}`/.test(main), 'no variable values in the status line');
  });
  it('Variabelen row has a reserved fixed height and Debug-off does not change the toolbar height', () => {
    const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
    assert.match(css.match(/\.debug-vars\s*\{([\s\S]*?)\}/)[1], /\bheight:\s*[\d.]+rem/);
    assert.match(css, /\.debug-vars\.is-off\s*\{\s*visibility:\s*hidden/);
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id="debugVars" class="debug-vars is-off"/);
    assert.ok(!/id="debugVars"[^>]*\bhidden\b/.test(html));
    assert.ok(!/id="debugHint"/.test(html), 'hint row removed (moved into tooltip)');
    assert.match(html, /<div id="debugRow" class="status-row">[\s\S]*id="debugGroup"[\s\S]*id="runStatus"[\s\S]*<\/div>\s*<div id="debugVars"/);
    assert.ok(!/id="debugGroup"[^>]*\bhidden\b/.test(html));
    assert.match(css, /\.status-row\.is-off \.debug-group\s*\{\s*visibility:\s*hidden/);
    assert.match(css.match(/\.status-row\s*\{([\s\S]*?)\}/)[1], /min-height:\s*[\d.]+rem/);
  });
});
