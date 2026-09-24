import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Telemetry panel sizing', () => {
  it('defaults to 10 rows and is vertically resizable', () => {
    const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
    const match = css.match(/\.telemetry\s*\{([\s\S]*?)\}/);
    assert.ok(match, 'telemetry CSS rule should exist');

    const rule = match[1];
    assert.match(rule, /height:\s*10lh\s*;/);
    assert.match(rule, /min-height:\s*4lh\s*;/);
    assert.match(rule, /max-height:\s*none\s*;/);
    assert.match(rule, /resize:\s*vertical\s*;/);
    assert.match(rule, /flex-shrink:\s*0\s*;/);
  });

  it('keeps telemetry in the scrollable side-panel body', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /<pre id="telemetryOut" class="telemetry"><\/pre>/);
    assert.match(html, /<div class="side-panel-body">/);
  });
});
