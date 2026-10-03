import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('BIOBUZZ field frame HUD', () => {
  it('shows the official FTC field axes and yaw reference next to the runtime HUD', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /class="field-frame-hud"/);
    assert.match(html, /Field <strong>\+X→ · \+Y↑ · yaw 0°↑ · \+90°← · −90°→ · 180°↓<\/strong>/);
    assert.match(html, /Officieel FTC field frame vanaf de Red Wall/);
  });
});
