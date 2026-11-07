import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Telemetry panel sizing', () => {
  it('telemetry-deelpaneel: standaard ~10 regels, vergroot via de stack-splitter', () => {
    const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
    assert.match(css, /\.stack-pane\[data-pane="telemetry"\]:not\(\[style\*="height"\]\)\s*\{\s*height:\s*12lh;/);
    assert.match(css, /\.stack-splitter\s*\{[^}]*cursor:\s*row-resize/);
  });

  it('keeps telemetry in the side-panel stack', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /<pre id="telemetryOut" class="telemetry"><\/pre>/);
    assert.match(html, /<div class="side-panel-body" id="sideStack">/);
  });
});
