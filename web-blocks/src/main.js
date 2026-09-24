import { publicUrl } from './publicUrl.js';
import { loadSimpleSim, SimpleViewer, SimpleHardwareAdapter } from './worlds/simple/index.js';
import { loadBiobuzzSim, BiobuzzViewer, InputHandler } from './worlds/biobuzz/index.js';
import { BiobuzzHardwareAdapter } from './mujoco/BiobuzzHardwareAdapter.js';
import { OpModeRunner } from './execution/OpModeRunner.js';
import { BlocksBridge } from './editor/blocksBridge.js';
import { seedBlkProject } from './editor/seedProject.js';
import { createRuntime } from './ftc-runtime/createRuntime.js';
import { initSplitLayout } from './ui/splitLayout.js';
import { composeTelemetry } from './ui/telemetryView.js';

const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const el = $('logOut');
  const ts = new Date().toLocaleTimeString('nl-NL');
  el.textContent = `[${ts}] ${msg}\n` + el.textContent.slice(0, 4000);
};

/** @type {'biobuzz'|'simple'} */
let worldId = 'biobuzz';
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
let latestOpModeTelemetry = '';
let lastRenderedTelemetry = null;
let opModeOwns = false; // true from INIT through RUN until DONE/ERROR/Idle after STOP

function parseWorldFromUrl() {
  const q = new URLSearchParams(location.search).get('world');
  if (q === 'simple' || q === 'biobuzz') return q;
  return 'biobuzz';
}


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

async function boot() {
  worldId = parseWorldFromUrl();
  initAppSplitLayout();
  const sel = $('worldSelect');
  if (sel) sel.value = worldId;

  const configUrl =
    worldId === 'simple'
      ? publicUrl('robots/REVStarterBot2026/simulation.json')
      : publicUrl('robots/BIOBUZZ/simulation.json');

  simConfig = await (await fetch(configUrl)).json();
  runtime = createRuntime(simConfig, {
    onTelemetry: (t) => {
      setOpModeTelemetry(t);
    },
  });

  $('runStatus').textContent = 'MuJoCo laden…';
  $('brandSub').textContent =
    worldId === 'biobuzz'
      ? 'BIOBUZZ field + soft mechanisms'
      : 'REVStarterBot2026 (vereenvoudigd)';

  if (worldId === 'biobuzz') {
    mujocoBundle = await loadBiobuzzSim((s) => {
      $('runStatus').textContent = s;
    });
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
    teleopInput = new InputHandler();
    $('biobuzzHud').hidden = false;
    $('teleopHint').textContent =
      'Idle teleop: W/S·I/K tank · pijltjes · E intake · Space/F shoot · X place · C reverse · T arcade. OpMode: sticks + E/C/X/Space/F/G/B/Y + UJHL dpad → gamepad1.';
  } else {
    mujocoBundle = await loadSimpleSim(publicUrl('robots/REVStarterBot2026/scene.xml'), (s) => {
      $('runStatus').textContent = s;
    });
    adapter = new SimpleHardwareAdapter(
      mujocoBundle.mujoco,
      mujocoBundle.model,
      mujocoBundle.data,
      simConfig,
    );
    viewer = new SimpleViewer(
      $('simCanvas'),
      mujocoBundle.mujoco,
      mujocoBundle.model,
      mujocoBundle.data,
    );
    viewer.init();
    $('biobuzzHud').hidden = true;
    $('teleopHint').textContent =
      'Toetsenbord OpMode: W/S·I/K·pijltjes sticks · E=RB C=LB X Space/F=RT G/B/Y · U/J/H/L=dpad · doodzone 0.05';
  }

  runner = new OpModeRunner({
    onStatus: (phase, label) => {
      $('runStatus').textContent = label ? `${phase} · ${label}` : phase;
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
      if (opModeOwns) adapter.applyCommands(cmds);
    },
    onTelemetryUpdate: (text) => {
      setOpModeTelemetry(text);
    },
    onTelemetryClear: () => {
      setOpModeTelemetry('');
    },
    onError: (message, label) => {
      log(`FOUT${label ? ` @ ${label}` : ''}: ${message}`);
      $('runStatus').textContent = 'ERROR';
      adapter.zeroAll();
      opModeOwns = false;
      clearGamepadOverrides();
      updateButtons('ERROR');
    },
    onDone: (reason) => {
      log(`OpMode klaar (${reason})`);
      opModeOwns = false;
      clearGamepadOverrides();
      adapter.zeroAll();
      updateButtons('DONE');
    },
  });

  bridge = new BlocksBridge($('blocksFrame'));
  // Install alleen na bewuste navigatie (openProjects / openEditorWithProject).
  // Een losse load-handler race't met navigatie en injecteert soms in het oude document.

  wireUi();
  wireGamepadFallback();
  startLoop();
  $('runStatus').textContent = 'Idle';
  log(
    worldId === 'biobuzz'
      ? 'BIOBUZZ gereed — idle teleop actief; INIT/START voor Blocks OpMode.'
      : 'Simulator gereed. Open een voorbeeld of bewerk Blocks, daarna INIT.',
  );
  updateBiobuzzHud();
}

function setOpModeTelemetry(text) {
  latestOpModeTelemetry = String(text || '');
  renderTelemetry();
}

function renderTelemetry() {
  const mechanismText =
    worldId === 'biobuzz' && adapter?.mechanismTelemetryText
      ? adapter.mechanismTelemetryText()
      : '';
  const text = composeTelemetry(latestOpModeTelemetry, mechanismText);
  if (text === lastRenderedTelemetry) return;
  lastRenderedTelemetry = text;
  $('telemetryOut').textContent = text;
}

function updateBiobuzzHud() {
  if (worldId !== 'biobuzz' || !adapter?.getHud) return;
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
}

function wireUi() {
  $('worldSelect').onchange = () => {
    const w = $('worldSelect').value;
    const url = new URL(location.href);
    url.searchParams.set('world', w);
    location.href = url.toString();
  };

  $('btnLoadExample').onclick = async () => {
    const name = $('exampleSelect').value;
    if (!name) return;
    try {
      log(`Laden: ${name}…`);
      const text = await (await fetch(publicUrl(`examples/${name}`))).text();
      const projectName = name.replace(/\.blk$/, '');
      // Seed IndexedDB (vendor fetch) + open editor; blokken altijd via setBlk
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

  $('btnExportBlk').onclick = async () => {
    try {
      const blk = await bridge.getBlk();
      downloadText(`${currentName()}.blk`, blk);
    } catch (e) {
      log(e.message);
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
    adapter.resetPose();
    runtime.resetAll();
    latestCommands = {};
    latestOpModeTelemetry = '';
    lastRenderedTelemetry = null;
    opModeOwns = false;
    clearGamepadOverrides();
    renderTelemetry();
    log('Sim gereset');
    updateButtons('Idle');
    $('runStatus').textContent = 'Idle';
    updateBiobuzzHud();
  };

  $('btnInit').onclick = async () => {
    try {
      let code = $('jsOut').textContent;
      if (!code || code.length < 20) {
        await bridge.install();
        await bridge.waitUntilReady({ requireBlocks: true });
        code = await bridge.getJavaScript();
        $('jsOut').textContent = code;
      }
      adapter.resetPose();
      runtime.resetAll();
      latestCommands = {};
      latestOpModeTelemetry = '';
      lastRenderedTelemetry = null;
      adapter.zeroAll();
      opModeOwns = true;
      renderTelemetry();
      const sensors = adapter.readSensors();
      await runner.init(code, {
        sensors,
        supplyVoltage: simConfig.supplyVoltage,
      });
      log('INIT — runOpMode tot waitForStart (OpMode owns actuators)');
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
    if (opModeOwns || worldId === 'simple') {
      if (e.key.startsWith('Arrow') || e.key === ' ' || e.code === 'Space') e.preventDefault();
      applyKeys(keys);
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (opModeOwns || worldId === 'simple') applyKeys(keys);
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
  if (worldId === 'biobuzz' && !opModeOwns) return;
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
    if (worldId === 'biobuzz' && !opModeOwns && teleopInput) {
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
    while (physicsAccumulator >= timestep && steps < 50) {
      if (worldId === 'biobuzz' && adapter.physicsTick) {
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
    // Keep BIOBUZZ mechanism/HIVE telemetry live even when the OpMode does not
    // emit a new telemetry.update() in this render frame.
    renderTelemetry();
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
