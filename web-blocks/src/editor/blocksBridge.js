import { publicUrl } from '../publicUrl.js';
import { blockVarRefs, formatVarTooltip } from './varHover.js';
/**
 * postMessage-brug naar de vendor FTC Offline Blocks iframe.
 * Isolatie: vendor globals blijven in iframe; setOnline(false) blijft de offline-route.
 */

const SRC_PREFIX = publicUrl('vendor/ftc-blocks/');

export class BlocksBridge {
  constructor(iframe) {
    this.iframe = iframe;
    this._reqId = 1;
    this._pending = new Map();
    this._navGen = 0;
    window.addEventListener('message', (ev) => this._onMessage(ev));
  }

  _win() {
    return this.iframe.contentWindow;
  }

  _onMessage(ev) {
    const data = ev.data;
    if (!data || data.channel !== 'ftc-blocks-mujoco') return;
    if (data.type === 'response' && this._pending.has(data.id)) {
      const { resolve, reject } = this._pending.get(data.id);
      this._pending.delete(data.id);
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    }
  }

  /**
   * Wacht op de volgende iframe-load na een navigatie.
   * Belangrijk: NIET early-returnen op readyState===complete van de OUDE pagina.
   */
  _waitForNextLoad() {
    const gen = ++this._navGen;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done || gen !== this._navGen) return;
        done = true;
        // Laat body onload / initializeFtcBlocks starten
        setTimeout(() => resolve(), 0);
      };
      this.iframe.addEventListener('load', finish, { once: true });
      setTimeout(() => {
        if (done || gen !== this._navGen) return;
        reject(new Error('Timeout: Blocks-iframe laadde niet'));
      }, 20000);
    });
  }

  /** Injecteer bridge-script in de huidige iframe-document. */
  async install() {
    const win = this._win();
    if (!win || !win.document) throw new Error('Blocks-iframe niet beschikbaar');

    // Altijd opnieuw injecteren na navigatie (flag zit in dat document)
    if (win.__ftcBlocksMujocoBridge) return;

    const script = win.document.createElement('script');
    script.textContent = IFRAME_BRIDGE_SOURCE;
    win.document.documentElement.appendChild(script);

    try {
      win.setOnline?.(false);
    } catch (_) {}

    // Ping: bridge moet antwoorden
    await this.request('ping', {}, 5000);
  }

  request(action, payload = {}, timeoutMs = 20000) {
    const id = this._reqId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Timeout bij editor-actie: ${action}`));
      }, timeoutMs);
      this._pending.set(id, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
      try {
        this._win()?.postMessage(
          { channel: 'ftc-blocks-mujoco', type: 'request', id, action, payload },
          '*',
        );
      } catch (e) {
        clearTimeout(t);
        this._pending.delete(id);
        reject(e);
      }
    });
  }

  /** Wacht tot Blockly.workspace bestaat (inject klaar). */
  waitUntilReady({ requireBlocks = false, timeoutMs = 30000 } = {}) {
    return this.request('waitReady', { requireBlocks }, timeoutMs);
  }

  getJavaScript() {
    return this.request('getJavaScript');
  }

  getJava() {
    return this.request('getJava');
  }

  /**
   * Debug-JS: zelfde generator, maar tijdelijk met STATEMENT_PREFIX `highlightBlock(id);`.
   * Gebruikt NIET voor weergave/export (zie getJavaScript / getJava).
   */
  getDebugJavaScript() {
    return this.request('getDebugJavaScript');
  }

  /**
   * Markeer het huidige blok (null = wis). → { found, type, text, touched }
   * `touched` = { cur: { reads: string[], writes: string[] }, prev: { … } | null }: JS-namen van variabelen die het
   * huidige blok leest/schrijft (variables_get/set, math_change, for-tellers) en die het vorige (al uitgevoerde) blok schreef.
   */
  debugHighlight(blockId, prevBlockId) {
    return this.request('debugHighlight', { blockId: blockId ?? null, prevBlockId: prevBlockId ?? null }, 5000);
  }

  /**
   * Variabelen-snapshot voor de hover-tooltip in de editor ([{ name, scope, text }]); null = tooltip uitzetten
   * (niet gepauzeerd). Alleen tijdens een debug-pauze meegeven.
   */
  setDebugVars(vars) {
    return this.request('setDebugVars', { vars: vars || null }, 5000);
  }

  /** Markeer alle blokken die variabele `name` (JS- of weergavenaam) gebruiken; null wist. → { count } */
  highlightVarBlocks(name) {
    return this.request('highlightVarBlocks', { name: name ?? null }, 5000);
  }

  /** Toggle breakpoint op het geselecteerde blok. → { ok, id, on, text } of { ok:false, message } */
  toggleBreakpointOnSelection() {
    return this.request('toggleBreakpointOnSelection', {}, 5000);
  }

  /** Vervang alle breakpoint-markeringen. → { ids } (alleen bestaande statement-blokken). */
  setBreakpointMarks(ids) {
    return this.request('setBreakpointMarks', { ids: ids || [] }, 5000);
  }

  /** Wis highlight + (optioneel) breakpoint-markeringen. */
  clearDebugMarks({ breakpoints = false } = {}) {
    return this.request('clearDebugMarks', { breakpoints }, 5000);
  }

  getBlk() {
    return this.request('getBlk');
  }

  setBlk(content, projectName = 'SimProject') {
    return this.request('setBlk', { content, projectName }, 30000);
  }

  async _navigate(url) {
    const loadPromise = this._waitForNextLoad();
    this.iframe.src = url;
    await loadPromise;
    try {
      if (this._win()) {
        this._win().__ftcBlocksMujocoBridge = false;
        this._win().__ftcBlocksMujocoBridgeInstalled = false;
      }
    } catch (_) {}
    await this.install();
  }

  async openEditorWithProject(projectName) {
    await this._navigate(
      `${SRC_PREFIX}FtcOfflineBlocks.html?project=${encodeURIComponent(projectName)}`,
    );
    // Alleen workspace (inject) — blokken laden we zelf via setBlk
    await this.waitUntilReady({ requireBlocks: false, timeoutMs: 30000 });
  }

  async openProjects() {
    await this._navigate(`${SRC_PREFIX}FtcOfflineBlocksProjects.html`);
  }
}

/** Runs inside the vendor iframe. */
const IFRAME_BRIDGE_SOURCE = `
var __ftcBlockVarRefs = ${blockVarRefs.toString()};
var __ftcFormatVarTooltip = ${formatVarTooltip.toString()};
(function(){
  if (window.__ftcBlocksMujocoBridgeInstalled) return;
  window.__ftcBlocksMujocoBridgeInstalled = true;
  window.__ftcBlocksMujocoBridge = true;

  function hasWorkspace() {
    try {
      return (typeof workspace !== 'undefined') && !!workspace && (typeof workspace.getTopBlocks === 'function');
    } catch (e) {
      return false;
    }
  }


  // ——— Debugger-markeringen (alleen CSS-klassen op de block-SVG; geen vendor-patch) ———
  var bpIds = new Set();
  var currentMarked = null;
  function ensureDebugStyle() {
    if (document.getElementById('ftc-debug-style')) return;
    var st = document.createElement('style');
    st.id = 'ftc-debug-style';
    st.textContent =
      '.ftc-debug-current > .blocklyPath { stroke: #ffd400 !important; stroke-width: 4px !important; } ' +
      '.ftc-debug-current > .blocklyPathLight { display: none; } ' +
      '.ftc-debug-bp > .blocklyPath { stroke: #e5484d !important; stroke-width: 3px !important; stroke-dasharray: 6 3; } ' +
      '.ftc-debug-current.ftc-debug-bp > .blocklyPath { stroke: #ffd400 !important; stroke-dasharray: none; } ' +
      '.ftc-debug-var > .blocklyPath { stroke: #3d8bfd !important; stroke-width: 3px !important; } ' +
      '#ftc-debug-tip { position: fixed; z-index: 2147483647; display: none; pointer-events: none; max-width: 560px; max-height: 70vh; overflow: hidden; ' +
      'white-space: pre-wrap; word-break: break-word; padding: 4px 8px; border-radius: 4px; background: #1b2231; ' +
      'color: #ffe58a; border: 1px solid #ffd400; font: 12px/1.35 ui-monospace, Consolas, monospace; box-shadow: 0 2px 8px rgba(0,0,0,.45); }';
    document.head.appendChild(st);
  }
  function addCls(b, cls, on) {
    try {
      var g = b.getSvgRoot && b.getSvgRoot();
      if (!g) return;
      if (on) g.classList.add(cls); else g.classList.remove(cls);
    } catch (e) {}
  }
  function applyBpClass(b, on) { addCls(b, 'ftc-debug-bp', on); }
  function clearCurrentMark() {
    try { workspace.highlightBlock(null); } catch (e) {}
    if (currentMarked) addCls(currentMarked, 'ftc-debug-current', false);
    currentMarked = null;
  }
  function markCurrent(b) {
    currentMarked = b;
    addCls(b, 'ftc-debug-current', true);
    try { workspace.highlightBlock(b.id); } catch (e) {}
  }
  // Variabelen die een statement-blok leest/schrijft (voor het Variabelen-paneel). Value-blokken hebben geen eigen
  // highlight (STATEMENT_PREFIX), dus lezen zoeken we in de value-inputs van het statement-blok zelf.
  var WRITE_TYPES = { variables_set: 1, math_change: 1, controls_for: 1, controls_forEach: 1 };
  function jsVarName(b) {
    var f = b.getField && b.getField('VAR');
    if (!f) return null;
    var disp = String(f.getText());
    var js = disp;
    try {
      var db = Blockly.JavaScript.variableDB_;
      if (db && typeof db.getName === 'function') js = db.getName(disp, Blockly.Variables.NAME_TYPE) || disp;
    } catch (e) {}
    return { name: js, display: disp };
  }
  function collectReads(b, out, seen) {
    if (!b || seen[b.id]) return;
    seen[b.id] = 1;
    if (b.type === 'variables_get') { var v = jsVarName(b); if (v) out.push(v); }
    (b.inputList || []).forEach(function (inp) {
      if (inp.type === 1 && inp.connection && inp.connection.targetBlock()) collectReads(inp.connection.targetBlock(), out, seen);
    });
  }
  function varTouch(b) {
    var reads = [], writes = [];
    if (!b) return { reads: reads, writes: writes };
    if (WRITE_TYPES[b.type]) { var w = jsVarName(b); if (w) writes.push(w); }
    (b.inputList || []).forEach(function (inp) {
      if (inp.type === 1 && inp.connection && inp.connection.targetBlock()) collectReads(inp.connection.targetBlock(), reads, {});
    });
    if (b.type === 'math_change') { var w2 = jsVarName(b); if (w2) reads.push(w2); }
    return { reads: reads, writes: writes };
  }
  // ——— Variabele-hover (alleen tijdens een debug-pauze; snapshot komt van de hoofdthread) ———
  var hoverVars = null;
  var tipEl = null;
  var varMarked = [];
  function toJsVarName(display) {
    try {
      var db = Blockly.JavaScript.variableDB_;
      if (db && typeof db.getName === 'function') return db.getName(display, Blockly.Variables.NAME_TYPE) || display;
    } catch (e) {}
    return display;
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
  function blockFromEvent(ev) {
    var el = ev.target;
    var g = el && el.closest ? el.closest('g[data-id]') : null;
    if (!g) return null;
    return workspace.getBlockById(g.getAttribute('data-id'));
  }
  function onHoverMove(ev) {
    if (!hoverVars || !hasWorkspace()) { hideTip(); return; }
    var b = null;
    try { b = blockFromEvent(ev); } catch (e) {}
    var text = b ? __ftcFormatVarTooltip(__ftcBlockVarRefs(b, toJsVarName), hoverVars) : '';
    if (!text) { hideTip(); return; }
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'ftc-debug-tip';
      document.body.appendChild(tipEl);
    }
    if (tipEl.textContent !== text) tipEl.textContent = text;
    tipEl.style.display = 'block';
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = ev.clientX + 14, y = ev.clientY + 16;
    if (x + w > window.innerWidth - 4) x = Math.max(4, ev.clientX - w - 10);
    if (y + h > window.innerHeight - 4) y = Math.max(4, ev.clientY - h - 10);
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  var hoverInstalled = false;
  function ensureHover() {
    if (hoverInstalled) return;
    hoverInstalled = true;
    document.addEventListener('mousemove', onHoverMove, true);
    document.addEventListener('mousedown', hideTip, true);
    document.addEventListener('mouseleave', hideTip, true);
    document.addEventListener('wheel', hideTip, true);
  }
  function clearVarMarks() {
    varMarked.forEach(function (b) { addCls(b, 'ftc-debug-var', false); });
    varMarked = [];
  }
  function describeBlock(b) {
    var t = '';
    try { t = String(b.toString(48) || ''); } catch (e) {}
    return t || b.type;
  }
  /** Scroll alleen als het blok buiten beeld valt. */
  function revealBlock(b) {
    try {
      var m = workspace.getMetrics();
      var scale = workspace.scale || 1;
      var xy = b.getRelativeToSurfaceXY();
      var left = -workspace.scrollX / scale;
      var top = -workspace.scrollY / scale;
      var w = m.viewWidth / scale;
      var h = m.viewHeight / scale;
      var inView = xy.x >= left && xy.y >= top && xy.x <= left + w * 0.9 && xy.y <= top + h * 0.9;
      if (!inView && typeof workspace.centerOnBlock === 'function') workspace.centerOnBlock(b.id);
    } catch (e) {}
  }

  function workspaceReadyError() {
    var href = '';
    try { href = String(location.href || ''); } catch (e) {}
    var onEditor = /FtcOfflineBlocks\\.html/i.test(href);
    if (!onEditor) {
      return 'Geen Blocks-workspace: open eerst een project in de editor (niet de projectenlijst).';
    }
    return 'Blocks-workspace is nog niet klaar (Blockly laadt nog of project ontbreekt in IndexedDB).';
  }

  function waitForWorkspace(requireBlocks, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var start = Date.now();
      (function tick() {
        try {
          if (typeof setOnline === 'function') setOnline(false);
          if (hasWorkspace()) {
            if (!requireBlocks) {
              resolve(true);
              return;
            }
            var finished = (typeof blocksFinishedLoading !== 'undefined' && blocksFinishedLoading);
            var n = 0;
            try { n = workspace.getTopBlocks(false).length; } catch (e2) {}
            if (finished || n > 0) {
              resolve(true);
              return;
            }
          }
        } catch (e) {}
        if (Date.now() - start > timeoutMs) {
          reject(new Error(workspaceReadyError()));
          return;
        }
        setTimeout(tick, 40);
      })();
    });
  }

  window.addEventListener('message', function(ev) {
    var data = ev.data;
    if (!data || data.channel !== 'ftc-blocks-mujoco' || data.type !== 'request') return;
    var id = data.id;
    function reply(result, error) {
      try {
        parent.postMessage({ channel: 'ftc-blocks-mujoco', type: 'response', id: id, result: result, error: error || null }, '*');
      } catch (e) {}
    }
    (async function() {
      try {
        if (typeof setOnline === 'function') setOnline(false);
        switch (data.action) {
          case 'ping':
            reply({ ok: true, href: String(location.href || '') });
            break;
          case 'waitReady': {
            var requireBlocks = !!(data.payload && data.payload.requireBlocks);
            await waitForWorkspace(requireBlocks, 28000);
            reply({
              ready: true,
              hasWorkspace: hasWorkspace(),
              blocksFinishedLoading: !!(typeof blocksFinishedLoading !== 'undefined' && blocksFinishedLoading)
            });
            break;
          }
          case 'getJavaScript':
            await waitForWorkspace(false, 5000);
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            if (typeof generateJavaScriptCode !== 'function') throw new Error('generateJavaScriptCode ontbreekt');
            reply(generateJavaScriptCode());
            break;
          case 'getJava':
            await waitForWorkspace(false, 5000);
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            if (typeof generateJavaCode !== 'function') throw new Error('generateJavaCode ontbreekt');
            var java = generateJavaCode();
            if (!java) throw new Error('generateJavaCode gaf lege output (project/classnaam?)');
            reply(java);
            break;
          case 'getDebugJavaScript': {
            await waitForWorkspace(false, 5000);
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            if (typeof generateJavaScriptCode !== 'function') throw new Error('generateJavaScriptCode ontbreekt');
            var gen = Blockly.JavaScript;
            var oldPrefix = gen.STATEMENT_PREFIX;
            var oldReserved = gen.RESERVED_WORDS_;
            var debugJs;
            try {
              gen.STATEMENT_PREFIX = 'highlightBlock(%1);\\n';
              if (typeof gen.addReservedWords === 'function') gen.addReservedWords('highlightBlock');
              debugJs = generateJavaScriptCode();
            } finally {
              gen.STATEMENT_PREFIX = oldPrefix;
              gen.RESERVED_WORDS_ = oldReserved;
            }
            reply(debugJs);
            break;
          }
          case 'debugHighlight': {
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            ensureDebugStyle();
            clearCurrentMark();
            var hid = data.payload && data.payload.blockId;
            if (!hid) { reply({ found: false }); break; }
            var hb = workspace.getBlockById(hid);
            if (!hb) { reply({ found: false }); break; }
            markCurrent(hb);
            revealBlock(hb);
            var pb = data.payload && data.payload.prevBlockId ? workspace.getBlockById(data.payload.prevBlockId) : null;
            reply({ found: true, type: hb.type, text: describeBlock(hb), touched: { cur: varTouch(hb), prev: pb ? varTouch(pb) : null } });
            break;
          }
          case 'setDebugVars': {
            ensureDebugStyle();
            ensureHover();
            var pv = data.payload && data.payload.vars;
            hoverVars = Array.isArray(pv) ? pv : null;
            if (!hoverVars) hideTip();
            reply({ active: !!hoverVars });
            break;
          }
          case 'highlightVarBlocks': {
            if (!hasWorkspace()) { reply({ count: 0 }); break; }
            ensureDebugStyle();
            clearVarMarks();
            var vn = data.payload && data.payload.name;
            if (vn) {
              workspace.getAllBlocks(false).forEach(function (vb) {
                var refs = __ftcBlockVarRefs(vb, toJsVarName);
                if (refs.some(function (r) { return r.name === vn || r.display === vn; })) { varMarked.push(vb); addCls(vb, 'ftc-debug-var', true); }
              });
            }
            reply({ count: varMarked.length });
            break;
          }
          case 'toggleBreakpointOnSelection': {
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            ensureDebugStyle();
            var sel = Blockly.selected;
            if (!sel || !sel.workspace || sel.workspace !== workspace) {
              reply({ ok: false, message: 'Selecteer eerst een blok in de editor.' });
              break;
            }
            if (!(sel.previousConnection || sel.nextConnection) || sel.outputConnection) {
              reply({ ok: false, message: 'Breakpoints kunnen alleen op statement-blokken (niet op waarde-blokken).' });
              break;
            }
            var on = !bpIds.has(sel.id);
            if (on) bpIds.add(sel.id); else bpIds.delete(sel.id);
            applyBpClass(sel, on);
            reply({ ok: true, id: sel.id, on: on, text: describeBlock(sel) });
            break;
          }
          case 'setBreakpointMarks': {
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            ensureDebugStyle();
            var want = (data.payload && data.payload.ids) || [];
            bpIds.forEach(function (id) { var b0 = workspace.getBlockById(id); if (b0) applyBpClass(b0, false); });
            bpIds = new Set();
            want.forEach(function (id) {
              var b1 = workspace.getBlockById(id);
              if (b1) { bpIds.add(id); applyBpClass(b1, true); }
            });
            reply({ ids: Array.from(bpIds) });
            break;
          }
          case 'clearDebugMarks': {
            if (!hasWorkspace()) { reply(true); break; }
            clearCurrentMark();
            clearVarMarks();
            if (data.payload && data.payload.breakpoints) {
              bpIds.forEach(function (id) { var b2 = workspace.getBlockById(id); if (b2) applyBpClass(b2, false); });
              bpIds = new Set();
            }
            reply(true);
            break;
          }
          case 'getBlk':
            await waitForWorkspace(false, 5000);
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            if (typeof Blockly === 'undefined') throw new Error('Blockly ontbreekt');
            var xml = Blockly.Xml.workspaceToDom(workspace);
            var xmlText = Blockly.Xml.domToText(xml);
            var extra;
            if (typeof formatExtraXml === 'function') {
              extra = formatExtraXml('TELEOP', '', '', '', true);
            } else {
              extra = "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><Extra><OpModeMeta flavor=\\"TELEOP\\" group=\\"\\" /><Enabled value=\\"true\\" /></Extra>";
            }
            reply(xmlText + extra);
            break;
          case 'setBlk':
            await waitForWorkspace(false, 28000);
            if (!hasWorkspace()) throw new Error(workspaceReadyError());
            if (typeof Blockly === 'undefined') throw new Error('Blockly ontbreekt');
            var content = (data.payload && data.payload.content) || '';
            var blockXml = content;
            if (typeof extractBlockContent === 'function') blockXml = extractBlockContent(content);
            workspace.clear();
            Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(blockXml), workspace);
            if (data.payload && data.payload.projectName && typeof currentProjectName !== 'undefined') {
              currentProjectName = data.payload.projectName;
            }
            try {
              if (typeof currentClassName !== 'undefined' && data.payload && data.payload.projectName) {
                currentClassName = String(data.payload.projectName).replace(/[^A-Za-z0-9_]/g, '_');
                if (Blockly.FtcJava && Blockly.FtcJava.setClassNameForFtcJava_) {
                  Blockly.FtcJava.setClassNameForFtcJava_(currentClassName);
                }
              }
            } catch (e3) {}
            if (typeof blocksFinishedLoading !== 'undefined') blocksFinishedLoading = true;
            reply(true);
            break;
          default:
            throw new Error('Onbekende actie: ' + data.action);
        }
      } catch (e) {
        reply(null, (e && e.message) || String(e));
      }
    })();
  });
})();
`;
