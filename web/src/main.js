import { loadBiobuzzSim } from './loader.js';
import { MujocoThreeViewer } from './renderer.js';
import { IntakeShooter, resetDriveState, setTankPower, updateDriveSlew } from './mechanisms.js';
import { HiveTipController } from './hive_tip.js';
import { InputHandler } from './controls.js';
import { AutoRunner } from './auto.js';
import { HOPPER_CAPACITY, NECTAR_HOPPER_CAPACITY } from './constants.js';
import { FieldBoundsReturn } from './field_bounds.js';

const loadingEl = document.getElementById('loading');
const statusEl = document.getElementById('loading-status');
const toastEl = document.getElementById('toast');
const modeEl = document.getElementById('hud-mode');
const hopperEl = document.getElementById('hud-hopper');
const scoreRedEl = document.getElementById('hud-score-red');
const scoreBlueEl = document.getElementById('hud-score-blue');
const intakeEl = document.getElementById('hud-intake');
const nectarEl = document.getElementById('hud-nectar');
const fpsEl = document.getElementById('hud-fps');
const btnAuto = document.getElementById('btn-auto');
const btnReset = document.getElementById('btn-reset');
const canvas = document.getElementById('view');

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function updateScoreHud(hiveTip) {
  if (scoreRedEl) scoreRedEl.textContent = String(hiveTip.score.red);
  if (scoreBlueEl) scoreBlueEl.textContent = String(hiveTip.score.blue);
}

function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

async function main() {
  let mujoco;
  let model;
  let data;
  try {
    ({ mujoco, model, data } = await loadBiobuzzSim(setStatus));
  } catch (err) {
    console.error(err);
    setStatus(`Fout: ${err.message || err}`);
    return;
  }

  setStatus('Three.js viewer opbouwen…');
  const viewer = new MujocoThreeViewer(canvas, mujoco, model, data);
  await viewer.init();

  const mech = new IntakeShooter(mujoco, model, data);
  const hiveTip = new HiveTipController(mujoco, model, data);
  const fieldBounds = new FieldBoundsReturn(mujoco, model, data);
  mech.resetAndPreload();
  hiveTip.reset();
  updateScoreHud(hiveTip);
  mujoco.mj_forward(model, data);
  viewer.sync();
  hopperEl.textContent = `${mech.count} / ${HOPPER_CAPACITY}`;
    if (nectarEl) nectarEl.textContent = `${mech.nectarCount} / ${NECTAR_HOPPER_CAPACITY}`;
  modeEl.textContent = 'tank';

  const input = new InputHandler();
  const auto = new AutoRunner({
    getModel: () => model,
    getData: () => data,
    getMech: () => mech,
    onTelemetry: (msg) => toast(msg, 2200),
  });

  function resetSim() {
    mujoco.mj_resetDataKeyframe(model, data, 0);
    mujoco.mj_forward(model, data);
    mech.resetAndPreload();
    hiveTip.reset();
    resetDriveState();
    updateScoreHud(hiveTip);
    mujoco.mj_forward(model, data);
    viewer.sync();
    toast('Reset — 4 pollen in hopper');
  }

  btnReset.addEventListener('click', () => {
    if (auto.active) auto.abort();
    resetSim();
  });

  btnAuto.addEventListener('click', async () => {
    if (auto.active) {
      auto.abort();
      toast('Auto afgebroken');
      btnAuto.textContent = 'Autonoom';
      return;
    }
    btnAuto.textContent = 'Stop auto';
    toast('Autonoom: LeaveAndGarden');
    await auto.runLeaveAndGarden();
    btnAuto.textContent = 'Autonoom';
  });

  loadingEl.classList.add('hidden');
  toast(`Klaar — hopper ${mech.count}`, 2500);

  const timestep = model.opt.timestep;
  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsValue = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const cmd = input.poll();
    if (!auto.active) {
      if (cmd.reset) resetSim();
      setTankPower(data, cmd.left, cmd.right);
      mech.setIntakePower(cmd.intake);
      if (cmd.shoot) {
        const ok = mech.fire();
        if (ok) {
          mech.update();
          toast(`Shoot OK — hopper ${mech.count}`, 1200);
        } else {
          toast('Hopper leeg', 1200);
        }
      }
      if (cmd.placeNectar) {
        const result = mech.tryPlaceNectar();
        if (result === 'placed_nectar') toast('Nectar in bloem (midden)', 1400);
        else if (result === 'placed_pollen') toast('Pollen in bloem (midden)', 1400);
        else if (result === 'dropped_nectar') toast('Nectar op veld gevallen', 1400);
        else if (result === 'dropped_pollen') toast('Pollen op veld gevallen', 1400);
        else if (result === 'full') toast('Bloem-stack vol', 1400);
        else toast('Achtercompartiment leeg', 1200);
      }
      if (cmd.modeChanged) {
        modeEl.textContent = cmd.arcade ? 'arcade' : 'tank';
        toast(`Mode: ${modeEl.textContent}`);
      }
    } else {
      // During auto, still allow reset / intake display from keys lightly
      if (cmd.reset) {
        auto.abort();
        resetSim();
      }
    }

    // Real-time catch-up: ~timestep physics, clamp substeps
    let simDt = 0;
    const maxSub = 20;
    let n = 0;
    while (simDt < dt && n < maxSub) {
      mech.update();
      fieldBounds.setProtected(mech.protectedBodyIds());
      hiveTip.update();
      fieldBounds.update();
      if (hiveTip.lastEvent) {
        updateScoreHud(hiveTip);
        toast(hiveTip.lastEvent, 2500);
        hiveTip.lastEvent = '';
      }
      updateDriveSlew(data, timestep);
      mujoco.mj_step(model, data);
      simDt += timestep;
      n++;
    }

    viewer.sync();
    viewer.render();

    intakeEl.textContent = mech.intakePower > 0.05 ? 'AAN' : mech.intakePower < -0.05 ? 'UIT (achter)' : 'uit';
    updateScoreHud(hiveTip);
    hopperEl.textContent = `${mech.count} / ${HOPPER_CAPACITY}`;
    if (nectarEl) nectarEl.textContent = `${mech.nectarCount} / ${NECTAR_HOPPER_CAPACITY}`;
    if (!cmd.modeChanged) modeEl.textContent = input.arcade ? 'arcade' : 'tank';

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      fpsValue = Math.round(fpsFrames / fpsAccum);
      fpsEl.textContent = String(fpsValue);
      fpsAccum = 0;
      fpsFrames = 0;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
