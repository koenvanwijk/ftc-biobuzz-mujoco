import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clampPaneHeight, loadStackSizes, saveStackSizes, STACK_STORAGE_KEY } from '../../src/ui/stackSplitters.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

describe('stackSplitters', () => {
  it('clamp met minimum', () => {
    assert.equal(clampPaneHeight(10), 40);
    assert.equal(clampPaneHeight(123.6), 124);
    assert.equal(clampPaneHeight(NaN, 30), 30);
    assert.equal(clampPaneHeight(900, 40, 500), 500);
  });
  it('hoogtes bewaren en laden; kapotte JSON = leeg', () => {
    const s = mem();
    saveStackSizes(s, { telemetry: 150, route: 300 });
    assert.deepEqual(loadStackSizes(s), { telemetry: 150, route: 300 });
    s.setItem(STACK_STORAGE_KEY, '{kapot');
    assert.deepEqual(loadStackSizes(s), {});
    assert.deepEqual(loadStackSizes(null), {});
  });
  it('index.html heeft 4 deelpanelen in #sideStack', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const panes = [...html.matchAll(/class="stack-pane[^"]*" data-pane="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(panes, ['status', 'telemetry', 'route', 'log']);
    assert.match(html, /id="sideStack"/);
  });
});
