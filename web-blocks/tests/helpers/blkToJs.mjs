/**
 * Headless FTC Blocks: load the vendored Blockly + FTC block definitions in jsdom and turn a .blk
 * file into the same JavaScript the editor sends to the OpMode worker (generateJavaScriptCode).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vendor = path.join(root, 'vendor/ftc-blocks');

let win = null;
function loadVendor() {
  if (win) return win;
  const html = fs.readFileSync(path.join(vendor, 'FtcOfflineBlocks.html'), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1])
    .filter((s) => !/split\.min/.test(s));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
  win = dom.window;
  const ctx = dom.getInternalVMContext();
  // messages.js is a Closure source file (goog.provide/require); a no-op shim is enough.
  for (const s of srcs) {
    const f = path.join(vendor, s);
    if (!fs.existsSync(f)) continue;
    // As separate classic scripts (top-level var → global), like <script src> in the editor.
    try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: s }); }
    catch (e) { throw new Error(`loading ${s}: ${e.message}`); }
  }
  return win;
}

export function blkToJs(file) {
  const w = loadVendor();
  const text = fs.readFileSync(path.isAbsolute(file) ? file : path.join(root, 'examples', file), 'utf8');
  const xml = text.slice(text.indexOf('<xml'), text.indexOf('</xml>') + 6);
  return w.eval(`(function(xmlText){
    var ws = new Blockly.Workspace();
    window.workspace = ws;
    Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(xmlText), ws);
    return generateJavaScriptCode();
  })`)(xml);
}
