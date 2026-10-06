import { publicUrl } from './publicUrl.js';
import { loadBiobuzzSim, BiobuzzViewer, InputHandler } from './worlds/biobuzz/index.js';
import { BiobuzzHardwareAdapter } from './mujoco/BiobuzzHardwareAdapter.js';
import { OpModeRunner } from './execution/OpModeRunner.js';
import { BlocksBridge } from './editor/blocksBridge.js';
import { seedBlkProject } from './editor/seedProject.js';
import { createRuntime } from './ftc-runtime/createRuntime.js';
import { initSplitLayout } from './ui/splitLayout.js';
import { initHelpPanel } from './help/helpPanel.js';
import { resolveCameraConfig, cameraFov, normalizeResolution, applyCameraMount } from './mujoco/robotCamera.js';
import { initCameraFovSelect, loadStoredDfov, describeFov } from './ui/cameraFovSelect.js';

const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const el = $('logOut');
  const ts = new Date().toLocaleTimeString('nl-NL');
  el.textContent = `[${ts}] ${msg}\n` + el.textContent.slice(0, 4000);
};

let simConfig;
let mujocoBundle;
let adapter;
let viewer;
let runtime;
let runner;
let bridge;
let latestCommands = {};
let anim = 0;
let physicsAccumulator = 0;
let teleopInput = null;
let opModeOwns = false; // true from INIT through RUN until DONE/ERROR/Idle after STOP

// ——— Robotcamera (Logitech Brio 4K) ———
let cameraCfg = resolveCameraConfig(null);
let cameraDfov = cameraCfg.defaultDfovDeg;
/** Resolutie uit VisionPortal.Builder.setCameraResolution (null = config, 640×480). */
let opModeCameraRes = null;

/** Eén zichtveld voor PiP, frustum-gizmo en detectie. */
function applyCameraFov() {
  const fov = cameraFov(cameraCfg, { dfovDeg: cameraDfov, ...(opModeCameraRes || {}) });
  adapter?.setCameraFov?.(fov);
  viewer?.setCameraFov?.(fov);
  const info = $('camFovInfo');
  if (info) {
    info.textContent = `${Math.round(fov.hfovDeg)}° × ${Math.round(fov.vfovDeg)}° · ${fov.width}×${fov.height}`;
    info.title = describeFov(fov);
  }
  const sel = $('camFovSelect');
  if (sel) sel.title = `${fov.model}: ${describeFov(fov)}`;
  return fov;
}

/**
 * OpMode-resolutie (pseudo-command `__camera` uit setCameraResolution) volgen, alleen
 * zolang de OpMode de robot bezit. Blijft staan na STOP; INIT en Reset sim zetten terug.
 */
function syncCameraResolution(cmds) {
  const cam = cmds && cmds.__camera;
  const res = cam && cam.type === 'cameraResolution' ? normalizeResolution(cam.width, cam.height) : null;
  if (!res) return;
  if (opModeCameraRes && opModeCameraRes.width === res.width && opModeCameraRes.height === res.height) return;
  opModeCameraRes = res;
  const fov = applyCameraFov();
  log(`Camera-resolutie ${res.width}×${res.height} → zichtveld ${describeFov(fov)}`);
}

function resetCameraResolution() {
  if (!opModeCameraRes) return;
  opModeCameraRes = null;
  applyCameraFov();
}

// ——— Blok-debugger ———
let debugMode = false; // toolbar-toggle (alleen te wisselen buiten een OpMode-sessie)
let debugSession = false; // huidige OpMode draait met debug-JS
/** 'off' | 'running' | 'pauseRequested' | 'paused' */
let debugState = 'off';
let simPaused = false; // fysica + simtijd bevroren zolang de debugger pauzeert
const breakpointIds = new Set();
let lastPhase = 'Idle';
let lastLabel = '';
let pausedText = '';
let pauseSeq = 0;
/** Laatste variabelen-lijst van de worker (bij pauze) + wat de blokken aanraken. */
let lastVars = [];
let lastTouched = null;
let lastDepth = null;

/** @type {{ applyPreset: (name: string) => void, destroy: () => void } | null} */
let splitLayoutApi = null;

function initAppSplitLayout() {
  const mainEl = document.getElementById('mainSplit') || document.querySelector('main.main');
  if (!mainEl || splitLayoutApi) return;
  splitLayoutApi = initSplitLayout({
    mainEl,
    panels: {
      editor: mainEl.querySelector('.editor-panel'),
      sim: mainEl.querySelector('.sim-panel'),
      code: mainEl.querySelector('.side-panel'),
    },
    splitters: [
      document.getElementById('splitter0'),
      document.getElementById('splitter1'),
    ].filter(Boolean),
    onLayoutChange: () => {
      try {
        viewer?.resize?.();
      } catch {
        /* viewer may not be ready yet */
      }
    },
  });
}

/** jsId → defaultDirection for every motor in simulation.json (drive + soft motors). */
function collectDefaultDirections(cfg) {
  const out = {};
  for (const e of [cfg.drive?.left, cfg.drive?.right, ...Object.values(cfg.motors || {})]) {
    if (e?.jsId && e.defaultDirection) out[e.jsId] = e.defaultDirection;
  }
  return out;
}

async function boot() {
  initAppSplitLayout();
  initHelpPanel(); // werkt onafhankelijk van MuJoCo-laden

  const configUrl = publicUrl('robots/BIOBUZZ/simulation.json');

  simConfig = await (await fetch(configUrl)).json();
  runtime = createRuntime(simConfig, {
    onTelemetry: (t) => {
      $('telemetryOut').textContent = mergeTelemetry(t);
    },
  });

  $('runStatus').textContent = 'MuJoCo laden…';
  $('brandSub').textContent = 'BIOBUZZ field + soft mechanisms';

  mujocoBundle = await loadBiobuzzSim((s) => {
    $('runStatus').textContent = s;
  });
  cameraCfg = resolveCameraConfig(simConfig.webcam?.camera);
  // Camerapositie/-kanteling uit simulation.json (webcam.camera.mount); zonder mount blijft de MJCF-pose.
  if (cameraCfg.mount) {
    applyCameraMount(mujocoBundle.mujoco, mujocoBundle.model, mujocoBundle.data, cameraCfg.mount);
  }
  adapter = new BiobuzzHardwareAdapter(
    mujocoBundle.mujoco,
    mujocoBundle.model,
    mujocoBundle.data,
    simConfig,
  );
  viewer = new BiobuzzViewer(
    $('simCanvas'),
    mujocoBundle.mujoco,
    mujocoBundle.model,
    mujocoBundle.data,
  );
  await viewer.init();
  cameraDfov = loadStoredDfov(cameraCfg);
  initCameraFovSelect($('camFovSelect'), cameraCfg, {
    value: cameraDfov,
    onChange: (d) => {
      cameraDfov = d;
      const fov = applyCameraFov();
      updateBiobuzzHud();
      log(`Camera-zichtveld: ${describeFov(fov)}`);
    },
  });
  applyCameraFov();
  teleopInput = new InputHandler();
  $('biobuzzHud').hidden = false;
  $('teleopHint').textContent =
    'Idle teleop: W/S·I/K tank · pijltjes · E intake · Space/F shoot · X place · C reverse · T arcade. OpMode: sticks + E/C/X/Space/F/G/B/Y + UJHL dpad → gamepad1.';

  runner = new OpModeRunner({
    onDebugState: (msg) => onDebugState(msg),
    onStatus: (phase, label) => {
      lastPhase = phase;
      lastLabel = label || '';
      renderRunStatus();
      updateButtons(phase);
      // OpMode owns actuators only while INIT / WAIT_FOR_START / RUN.
      // STOP / DONE / ERROR / Idle → idle BIOBUZZ teleop may drive.
      const base = String(phase || '').split(' ')[0];
      const nextOwns = base === 'INIT' || base === 'WAIT_FOR_START' || base === 'RUN';
      if (opModeOwns && !nextOwns) clearGamepadOverrides();
      opModeOwns = nextOwns;
    },
    onCommands: (cmds) => {
      latestCommands = cmds;
      if (opModeOwns) {
        syncCameraResolution(cmds);
        adapter.applyCommands(cmds);
      }
    },
    onTelemetryUpdate: (text) => {
      $('telemetryOut').textContent = mergeTelemetry(text);
    },
    onTelemetryClear: () => {
      $('telemetryOut').textContent = adapter.mechanismTelemetryText?.() || '';
    },
    onError: (message, label) => {
      log(`FOUT${label ? ` @ ${label}` : ''}: ${message}`);
      // Bij een fout in debug-modus blijft de laatste blok-highlight staan (toont waar het misging).
      endDebugSession({ keepHighlight: true });
      $('runStatus').textContent = 'ERROR';
      adapter.zeroAll();
      opModeOwns = false;
      clearGamepadOverrides();
      updateButtons('ERROR');
    },
    onDone: (reason) => {
      log(`OpMode klaar (${reason})`);
      endDebugSession();
      opModeOwns = false;
      clearGamepadOverrides();
      adapter.zeroAll();
      updateButtons('DONE');
    },
  });

  bridge = new BlocksBridge($('blocksFrame'));
  // Install alleen na bewuste navigatie (openProjects / openEditorWithProject).
  // Een losse load-handler race't met navigatie en injecteert soms in het oude document.

  // Read-only hook voor smoke tests / handmatig debuggen in de console.
  window.__ftcSim = {
    get clockSec() { return runtime.clock.timeSec; },
    get simPaused() { return simPaused; },
    get debugState() { return debugState; },
    get debugVars() { return lastVars; },
    get debugDepth() { return lastDepth; },
    /** Huidig camerazichtveld (preset + resolutie) zoals AprilTag- en POLLEN-detectie het gebruiken. */
    get cameraFov() { return adapter?.cameraFov ? { ...adapter.cameraFov } : null; },
    /** Aantal AprilTag-detecties en POLLEN-blobs in de laatste sensor-uitlezing. */
    visionCounts() {
      const s = adapter?.readSensors?.();
      return s ? { april: s.aprilTagDetections?.count ?? null, pollen: s.colorBlobDetections?.count ?? null,
        blobs: s.colorBlobDetections?.json ?? '[]', width: s.colorBlobDetections?.width, height: s.colorBlobDetections?.height } : null;
    },
  };

  wireUi();
  wireGamepadFallback();
  startLoop();
  $('runStatus').textContent = 'Idle';
  log('BIOBUZZ gereed — idle teleop actief; INIT/START voor Blocks OpMode.');
  updateBiobuzzHud();
}

function mergeTelemetry(opModeText) {
  if (!adapter?.mechanismTelemetryText) return opModeText || '';
  const mech = adapter.mechanismTelemetryText();
  if (!opModeText) return mech;
  return `${opModeText}\n---\n${mech}`;
}

function updateBiobuzzHud() {
  if (!adapter?.getHud) return;
  const h = adapter.getHud();
  $('hudHopper').textContent = `${h.hopper} / ${h.hopperCap}`;
  $('hudNectar').textContent = `${h.nectar} / ${h.nectarCap}`;
  $('hudScore').textContent = `R${h.scoreRed} · B${h.scoreBlue}`;
  $('hudIntake').textContent = h.intake;
  if ($('hudApril')) $('hudApril').textContent = String(h.aprilCount ?? 0);
  $('hudOwner').textContent = opModeOwns ? 'OpMode' : 'Teleop';
}

function updateButtons(phase) {
  const init = $('btnInit');
  const start = $('btnStart');
  const stop = $('btnStop');
  if (phase === 'WAIT_FOR_START' || phase === 'INIT') {
    start.disabled = false;
    stop.disabled = false;
    init.disabled = true;
  } else if (phase === 'RUN') {
    start.disabled = true;
    stop.disabled = false;
    init.disabled = true;
  } else {
    start.disabled = true;
    stop.disabled = true;
    init.disabled = false;
  }
  $('btnDebug').disabled = init.disabled;
  updateDebugButtons();
}

// ——— Debugger (UI) ———

/** Kort houden: de statusregel mag de toolbar nooit verschuiven (CSS knipt af met …; volledige tekst in `title`). */
function clipText(t, n) {
  t = String(t || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function renderRunStatus() {
  const el = $('runStatus');
  let full;
  if (debugState === 'paused') {
    full = `${pausedText} · ${lastPhase}`;
    el.classList.add('is-paused');
    const vt = varsStatusText(lastVars, lastTouched);
    el.title = `${full}${vt ? `\n${vt}` : ''}\nSimulatie (fysica + simtijd) staat stil zolang de debugger gepauzeerd is`;
  } else {
    full = lastLabel ? `${lastPhase} · ${lastLabel}` : lastPhase;
    el.classList.remove('is-paused');
    el.title = full;
  }
  el.textContent = full;
}

function updateDebugButtons() {
  const active = debugSession && debugState !== 'off';
  $('btnDbgStep').disabled = !(active && debugState === 'paused');
  $('btnDbgStepOver').disabled = !(active && debugState === 'paused');
  $('btnDbgStepOut').disabled = !(active && debugState === 'paused' && (lastDepth ?? 0) > 1);
  $('btnDbgContinue').disabled = !(active && debugState === 'paused');
  $('btnDbgPause').disabled = !(active && debugState === 'running');
  $('btnDebug').classList.toggle('is-active', debugMode);
  $('btnDebug').setAttribute('aria-pressed', String(debugMode));
  $('dbgBpCount').textContent = `${breakpointIds.size} BP`;
}

function setSimPaused(paused) {
  simPaused = paused;
  if (paused) runtime?.clock?.pause();
  else runtime?.clock?.resume();
  physicsAccumulator = 0; // geen inhaalslag na hervatten
}

// ——— Variabelen-paneel ———

function findVar(vars, ref) {
  return vars.find((v) => v.name === ref.name) || vars.find((v) => v.name === ref.display);
}

/** Bepaal welke variabelen het vorige blok schreef (waarde ná uitvoeren) en welke het huidige blok leest. */
function touchedRefs(touched) {
  const written = touched?.prev?.writes || [];
  const read = touched?.cur?.reads || [];
  const willWrite = touched?.cur?.writes || [];
  return { written, read, willWrite };
}

function renderVars(vars, touched) {
  const box = $('debugVars');
  const list = $('debugVarsList');
  const { written, read } = touchedRefs(touched);
  const isW = (v) => written.some((r) => r.name === v.name || r.display === v.name);
  const isR = (v) => read.some((r) => r.name === v.name || r.display === v.name);
  list.textContent = '';
  if (!vars.length) {
    const e = document.createElement('span');
    e.className = 'muted';
    e.textContent = '(nog geen variabelen)';
    list.appendChild(e);
  }
  // Aangeraakte variabelen eerst, dan lokaal, dan globaal (volgorde binnen groep blijft behouden).
  const rank = (v) => (isW(v) ? 0 : isR(v) ? 1 : 2);
  [...vars].sort((a, b) => rank(a) - rank(b)).forEach((v) => {
    const el = document.createElement('span');
    el.className = 'dv' + (isW(v) ? ' is-touched' : isR(v) ? ' is-read' : '');
    el.dataset.name = v.name;
    el.title = `${v.scope}${isW(v) ? ' · net gezet door het vorige blok' : isR(v) ? ' · gelezen door dit blok' : ''}`;
    const sc = document.createElement('span');
    sc.className = 'dv-scope';
    sc.textContent = v.scope === 'lokaal' ? 'lok' : 'glob';
    el.append(sc, `${v.name} = ${v.text}`);
    list.appendChild(el);
  });
  box.classList.remove('is-stale');
}

/** 'naam = waarde' voor de statusregel: eerst wat het vorige blok zette, anders wat het huidige blok leest. */
function varsStatusText(vars, touched) {
  const { written, read } = touchedRefs(touched);
  const parts = [];
  for (const r of written) {
    const v = findVar(vars, r);
    if (v) parts.push(`${v.name} = ${v.text}`);
  }
  if (!parts.length) {
    for (const r of read) {
      const v = findVar(vars, r);
      if (v && !parts.includes(`${v.name} = ${v.text}`)) parts.push(`${v.name} = ${v.text}`);
    }
  }
  return parts.slice(0, 3).join(', ');
}

/** Snapshot voor de hover-tooltip in de editor (null = uit). Fouten negeren: editor kan net navigeren. */
function setHoverVars(vars) {
  try {
    bridge?.setDebugVars(vars).catch(() => {});
  } catch (_) {
    /* bridge niet beschikbaar */
  }
}

function hideVars() {
  setHoverVars(null);
  lastVars = [];
  lastTouched = null;
  lastDepth = null;
  // Paneel blijft staan zolang Debug aan is (gereserveerde ruimte → geen layout-sprong); alleen de inhoud verdwijnt.
  $('debugVarsList').textContent = '';
  const e = document.createElement('span');
  e.className = 'muted';
  e.textContent = '(waarden verschijnen bij een pauze)';
  $('debugVarsList').appendChild(e);
  $('debugVars').classList.remove('is-stale');
  $('debugVarsInfo').textContent = '';
}

async function highlightBlock(blockId, prevBlockId) {
  try {
    return await bridge.debugHighlight(blockId, prevBlockId);
  } catch (e) {
    log(`Debug-highlight mislukt: ${e.message}`);
    return { found: false };
  }
}

function onDebugState(msg) {
  const state = msg.state;
  if (!debugSession && state !== 'off') return;
  if (state === 'off') {
    endDebugSession();
    return;
  }
  debugState = state;
  if (state === 'paused') {
    setSimPaused(true);
    const seq = ++pauseSeq;
    pausedText = `Gepauzeerd bij blok…`;
    lastVars = Array.isArray(msg.vars) ? msg.vars : [];
    lastDepth = typeof msg.depth === 'number' ? msg.depth : null;
    lastTouched = null;
    renderVars(lastVars, null);
    setHoverVars(lastVars);
    updateDebugButtons();
    renderRunStatus();
    (async () => {
      const info = msg.blockId ? await highlightBlock(msg.blockId, msg.prevBlockId) : { found: false };
      if (seq !== pauseSeq || debugState !== 'paused') return; // inmiddels hervat/gestopt
      if (!msg.blockId) pausedText = 'Gepauzeerd (wacht op sleep/START)';
      else if (info.found) pausedText = `Gepauzeerd bij blok: ${clipText(info.text, 48)}`;
      else pausedText = `Gepauzeerd (blok ${msg.blockId} niet gevonden in editor)`;
      if (msg.reason === 'breakpoint' && info.found) pausedText = `Breakpoint bij blok: ${clipText(info.text, 48)}`;
      lastTouched = info.touched || null;
      renderVars(lastVars, lastTouched);
      $('debugVarsInfo').textContent =
        (lastDepth != null ? `(functie-diepte ${lastDepth})` : '') +
        (lastTouched?.prev?.writes?.length ? ' · geel = net gezet' : '') +
        (lastTouched?.cur?.reads?.length ? ' · blauw = gelezen door dit blok' : '');
      renderRunStatus();
    })();
  } else {
    pauseSeq++;
    setSimPaused(false);
    $('debugVars').classList.add('is-stale'); // waarden zijn verouderd zodra de OpMode weer draait
    setHoverVars(null);
    renderRunStatus();
    updateDebugButtons();
  }
}

function endDebugSession({ keepHighlight = false } = {}) {
  const wasActive = debugSession;
  debugSession = false;
  debugState = 'off';
  pauseSeq++;
  setSimPaused(false);
  if (wasActive && !keepHighlight) {
    bridge?.clearDebugMarks().catch(() => {});
  }
  if (!keepHighlight) hideVars();
  else $('debugVars').classList.add('is-stale');
  setHoverVars(null);
  renderRunStatus();
  updateDebugButtons();
}

function wireDebugUi() {
  const applyToggle = () => {
    // Geen hidden/display-wissel: rij + knoppen houden hun plek (alleen visibility) → geen layout-sprong.
    $('debugRow').classList.toggle('is-off', !debugMode);
    $('debugVars').classList.toggle('is-off', !debugMode);
    hideVars();
    updateDebugButtons();
  };
  $('btnDebug').onclick = () => {
    if ($('btnDebug').disabled) return;
    debugMode = !debugMode;
    applyToggle();
    log(debugMode ? 'Debug-modus aan — INIT pauzeert bij het eerste blok' : 'Debug-modus uit');
  };
  const stepCommand = (cmd) => {
    if (debugState !== 'paused') return;
    pauseSeq++;
    // 'stepping': sim blijft bevroren tot de worker het volgende blok meldt (of 'running' bij sleep/wacht).
    debugState = 'stepping';
    runner.debugCommand(cmd);
    bridge.clearDebugMarks().catch(() => {});
    setHoverVars(null);
    $('debugVars').classList.add('is-stale');
    renderRunStatus();
    updateDebugButtons();
  };
  // Variabelenrij hoveren → blokken die deze variabele gebruiken blauw omranden in de editor.
  const varList = $('debugVarsList');
  varList.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest?.('.dv');
    if (!row || debugState !== 'paused') return;
    bridge.highlightVarBlocks(row.dataset.name).catch(() => {});
  });
  varList.addEventListener('mouseout', (ev) => {
    if (ev.target.closest?.('.dv')) bridge.highlightVarBlocks(null).catch(() => {});
  });
  $('btnDbgStep').onclick = () => stepCommand('step');
  $('btnDbgStepOver').onclick = () => stepCommand('stepOver');
  $('btnDbgStepOut').onclick = () => {
    if ((lastDepth ?? 0) > 1) stepCommand('stepOut');
  };
  $('btnDbgContinue').onclick = () => {
    if (debugState !== 'paused') return;
    pauseSeq++;
    runner.debugCommand('continue');
    bridge.clearDebugMarks().catch(() => {});
    setHoverVars(null);
    $('debugVars').classList.add('is-stale');
    debugState = 'running';
    setSimPaused(false);
    renderRunStatus();
    updateDebugButtons();
  };
  $('btnDbgPause').onclick = () => {
    if (debugState !== 'running') return;
    runner.debugCommand('pause');
  };
  $('btnDbgBreakpoint').onclick = async () => {
    try {
      const r = await bridge.toggleBreakpointOnSelection();
      if (!r.ok) {
        log(r.message);
        return;
      }
      if (r.on) breakpointIds.add(r.id);
      else breakpointIds.delete(r.id);
      runner.setBreakpoints([...breakpointIds]);
      log(`Breakpoint ${r.on ? 'gezet' : 'verwijderd'}: ${r.text}`);
      updateDebugButtons();
    } catch (e) {
      log(`Breakpoint: ${e.message}`);
    }
  };
  $('btnDbgClearBp').onclick = async () => {
    breakpointIds.clear();
    runner.setBreakpoints([]);
    try {
      await bridge.clearDebugMarks({ breakpoints: true });
    } catch (_) {
      /* editor niet beschikbaar */
    }
    updateDebugButtons();
    log('Alle breakpoints gewist');
  };
  applyToggle();
}

function wireUi() {
  wireDebugUi();
  $('btnLoadExample').onclick = async () => {
    const name = $('exampleSelect').value;
    if (!name) return;
    try {
      log(`Laden: ${name}…`);
      const text = await (await fetch(publicUrl(`examples/${name}`))).text();
      const projectName = name.replace(/\.blk$/, '');
      // Seed IndexedDB (vendor fetch) + open editor; blokken altijd via setBlk
      breakpointIds.clear(); // block-ids horen bij het vorige project
      updateDebugButtons();
      await bridge.openProjects();
      await seedBlkProject(projectName, text);
      await bridge.openEditorWithProject(projectName);
      await bridge.setBlk(text, projectName);
      const js = await bridge.getJavaScript();
      $('jsOut').textContent = js;
      try {
        $('javaOut').textContent = await bridge.getJava();
      } catch (e) {
        $('javaOut').textContent = `(Java-preview: ${e.message})`;
      }
      log(`Voorbeeld geladen: ${name}`);
    } catch (e) {
      log(`Laden mislukt: ${e.message}`);
    }
  };

  $('btnRefreshCode').onclick = async () => {
    try {
      await bridge.install();
      await bridge.waitUntilReady({ requireBlocks: false });
      $('jsOut').textContent = await bridge.getJavaScript();
      try {
        $('javaOut').textContent = await bridge.getJava();
      } catch (e) {
        $('javaOut').textContent = `(Java: ${e.message})`;
      }
      log('Code vernieuwd vanuit editor');
    } catch (e) {
      log(`Code vernieuwen: ${e.message}`);
    }
  };

  $('btnExportJava').onclick = async () => {
    try {
      const java = await bridge.getJava();
      downloadText(`${currentName()}.java`, java);
    } catch (e) {
      log(e.message);
    }
  };

  $('btnReset').onclick = () => {
    runner.stop(() => adapter.zeroAll());
    endDebugSession();
    adapter.resetPose();
    runtime.resetAll();
    latestCommands = {};
    resetCameraResolution();
    opModeOwns = false;
    clearGamepadOverrides();
    $('telemetryOut').textContent = '';
    log('Sim gereset');
    updateButtons('Idle');
    $('runStatus').textContent = 'Idle';
    updateBiobuzzHud();
  };

  $('btnInit').onclick = async () => {
    try {
      let code = $('jsOut').textContent;
      const useDebug = debugMode;
      if (useDebug) {
        // Instrumented JS (highlightBlock per statement-blok); weergave/export blijven ongewijzigd.
        await bridge.install();
        await bridge.waitUntilReady({ requireBlocks: true });
        code = await bridge.getDebugJavaScript();
      } else if (!code || code.length < 20) {
        await bridge.install();
        await bridge.waitUntilReady({ requireBlocks: true });
        code = await bridge.getJavaScript();
        $('jsOut').textContent = code;
      }
      adapter.resetPose();
      runtime.resetAll();
      latestCommands = {};
      resetCameraResolution();
      adapter.zeroAll();
      opModeOwns = true;
      const sensors = adapter.readSensors();
      endDebugSession();
      debugSession = useDebug;
      debugState = useDebug ? 'running' : 'off';
      await bridge.clearDebugMarks().catch(() => {});
      await runner.init(code, {
        sensors,
        supplyVoltage: simConfig.supplyVoltage,
        motorDefaultDirections: collectDefaultDirections(simConfig),
        debug: useDebug
          ? { enabled: true, startPaused: true, breakpoints: [...breakpointIds] }
          : { enabled: false },
      });
      updateDebugButtons();
      log(
        useDebug
          ? 'INIT (debug) — pauzeert bij eerste blok; gebruik Stap / Doorgaan'
          : 'INIT — runOpMode tot waitForStart (OpMode owns actuators)',
      );
    } catch (e) {
      log(`INIT mislukt: ${e.message}`);
      opModeOwns = false;
      clearGamepadOverrides();
    }
  };

  $('btnStart').onclick = () => {
    runner.start();
    log('START');
  };

  $('btnStop').onclick = () => {
    endDebugSession();
    runner.stop(() => {
      adapter.zeroAll();
      latestCommands = {};
      opModeOwns = false;
      clearGamepadOverrides();
    });
    log('STOP — drive + mechanisms zeroed; idle teleop hervat');
  };
}

function currentName() {
  return $('exampleSelect').value.replace(/\.blk$/, '') || 'OpMode';
}

function downloadText(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}


function clearGamepadOverrides() {
  try {
    runtime?.gamepad1?.clearOverrides?.();
    runtime?.gamepad2?.clearOverrides?.();
  } catch {
    /* ignore */
  }
}

function wireGamepadFallback() {
  const keys = Object.create(null);
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    // During OpMode: feed gamepad1 for Blocks. Idle BIOBUZZ uses InputHandler instead.
    if (opModeOwns) {
      if (e.key.startsWith('Arrow') || e.key === ' ' || e.code === 'Space') e.preventDefault();
      applyKeys(keys);
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (opModeOwns) applyKeys(keys);
  });

  const pad = $('gamepadPad');
  pad.querySelectorAll('button[data-axis]').forEach((btn) => {
    const axis = btn.dataset.axis;
    const dir = Number(btn.dataset.dir);
    const apply = (v) => {
      if (axis === 'ly') runtime.gamepad1.setAxisOverride('leftStickY', v);
      if (axis === 'ry') runtime.gamepad1.setAxisOverride('rightStickY', v);
    };
    btn.addEventListener('mousedown', () => apply(dir));
    btn.addEventListener('mouseup', () => apply(0));
    btn.addEventListener('mouseleave', () => apply(0));
    btn.addEventListener('touchstart', (ev) => {
      ev.preventDefault();
      apply(dir);
    });
    btn.addEventListener('touchend', () => apply(0));
  });
}

function applyKeys(keys) {
  // During OpMode: feed gamepad1 overrides for Blocks tank/arcade drive.
  // During biobuzz idle: InputHandler owns drive (see startLoop).
  // Axes: W/S → leftStickY · I/K or ↑/↓ → rightStickY · ←/→ → leftStickX
  // Buttons: E=RB, C=LB, X=X, Space/F=RT, G=A, B=B, Y=Y, U/J/H/L=Dpad
  if (!opModeOwns) return;
  let ly = 0;
  let ry = 0;
  let lx = 0;
  if (keys.w) ly -= 1;
  if (keys.s) ly += 1;
  if (keys.i || keys.arrowup) ry -= 1;
  if (keys.k || keys.arrowdown) ry += 1;
  if (keys.arrowleft) lx -= 1;
  if (keys.arrowright) lx += 1;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const gp = runtime.gamepad1;
  gp.setAxisOverride('leftStickY', clamp(ly));
  gp.setAxisOverride('rightStickY', clamp(ry));
  gp.setAxisOverride('leftStickX', clamp(lx));

  const space = !!(keys[' '] || keys.space);
  const shoot = space || !!keys.f;
  gp.setAxisOverride('rightTrigger', shoot ? 1 : 0);

  // Every named button each frame so release clears (false deletes override).
  gp.setButtonOverride('RightBumper', !!keys.e);
  gp.setButtonOverride('LeftBumper', !!keys.c);
  gp.setButtonOverride('X', !!keys.x);
  gp.setButtonOverride('A', !!keys.g);
  gp.setButtonOverride('B', !!keys.b);
  gp.setButtonOverride('Y', !!keys.y);
  gp.setButtonOverride('DpadUp', !!keys.u);
  gp.setButtonOverride('DpadDown', !!keys.j);
  gp.setButtonOverride('DpadLeft', !!keys.h);
  gp.setButtonOverride('DpadRight', !!keys.l);
}

function readGamepadSnapshot() {
  const g = (gp) => ({
    LeftStickX: gp.getLeftStickX(),
    LeftStickY: gp.getLeftStickY(),
    RightStickX: gp.getRightStickX(),
    RightStickY: gp.getRightStickY(),
    LeftTrigger: gp.getLeftTrigger(),
    RightTrigger: gp.getRightTrigger(),
    A: gp.getA(),
    B: gp.getB(),
    X: gp.getX(),
    Y: gp.getY(),
    LeftBumper: gp.getLeftBumper(),
    RightBumper: gp.getRightBumper(),
    DpadUp: gp.getDpadUp(),
    DpadDown: gp.getDpadDown(),
    DpadLeft: gp.getDpadLeft(),
    DpadRight: gp.getDpadRight(),
    AtRest: gp.getAtRest(),
  });
  return { g1: g(runtime.gamepad1), g2: g(runtime.gamepad2) };
}

function startLoop() {
  const { mujoco, model, data } = mujocoBundle;
  const timestep = model.opt.timestep;
  let last = performance.now();

  const frame = (now) => {
    anim = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    physicsAccumulator += dt;

    // Idle BIOBUZZ teleop when OpMode does not own actuators
    if (!opModeOwns && teleopInput) {
      const cmd = teleopInput.poll();
      if (cmd.reset) {
        adapter.resetPose();
        log('Teleop reset (R)');
      }
      adapter.applyTeleop(cmd);
    } else if (opModeOwns) {
      adapter.applyCommands(latestCommands);
    }

    let steps = 0;
    // Debugger gepauzeerd: fysica + simtijd staan stil (motoren houden hun laatste commando).
    if (simPaused) physicsAccumulator = 0;
    while (!simPaused && physicsAccumulator >= timestep && steps < 50) {
      if (adapter.physicsTick) {
        adapter.physicsTick(timestep);
      } else if (opModeOwns) {
        adapter.applyCommands(latestCommands);
      }
      mujoco.mj_step(model, data);
      runtime.clock.advance(timestep);
      physicsAccumulator -= timestep;
      steps++;
    }

    const sensors = adapter.readSensors();
    runtime.bus.setSensors(sensors);
    runner.pushClock(runtime.clock.timeSec, sensors, readGamepadSnapshot());
    if (viewer.sync) viewer.sync();
    if (viewer.render) viewer.render();
    updateBiobuzzHud();
  };
  anim = requestAnimationFrame(frame);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

boot().catch((e) => {
  console.error(e);
  $('runStatus').textContent = 'Boot-fout';
  log(String(e.stack || e));
});
