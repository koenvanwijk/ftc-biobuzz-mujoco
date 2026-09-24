import { publicUrl } from '../publicUrl.js';
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
