/**
 * On-screen virtual gamepad for phones (and optional desktop toggle):
 *  - analog joystick bottom-left → gamepad1 left stick X/Y
 *  - Schiet top-left → Right Trigger (Space/F / RT)
 *  - Intake top-right → Right Bumper (E / RB in REV Starter TeleOp)
 *
 * Mobile play is landscape-only: in portrait a Dutch “rotate phone” overlay is shown.
 * Stick axes: FTC/browser convention (up = negative Y, right = positive X).
 * Physical pad/keyboard merge: non-zero physical wins (GamepadBridge / InputHandler).
 */
const STORAGE_KEY = 'ftc-mobile-controls-v1';
const DEADZONE = 0.08;

function preferTouch() {
  try {
    return (
      (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window) ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    );
  } catch {
    return false;
  }
}

/** Phones in portrait OR landscape (e.g. 844×390): touch/coarse or short/narrow viewport. */
function preferMobilePlay() {
  try {
    if (preferTouch()) return true;
    if (typeof matchMedia !== 'function') return false;
    return (
      matchMedia('(pointer: coarse)').matches ||
      matchMedia('(max-height: 500px)').matches ||
      matchMedia('(max-width: 700px)').matches
    );
  } catch {
    return preferTouch();
  }
}

function isPortrait() {
  try {
    if (typeof matchMedia === 'function') {
      if (matchMedia('(orientation: portrait)').matches) return true;
      if (matchMedia('(orientation: landscape)').matches) return false;
    }
  } catch {
    /* fall through */
  }
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}

function loadForced() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch {
    /* ignore */
  }
  return null;
}

function saveForced(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function tryLockLandscape() {
  try {
    const o = screen?.orientation;
    if (o && typeof o.lock === 'function') {
      const p = o.lock('landscape');
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch {
    /* unsupported / needs gesture — ignore */
  }
}

/**
 * @param {{ root: HTMLElement, toggleBtn?: HTMLButtonElement | null }} opts
 */
export function initMobileControls({ root, toggleBtn = null }) {
  const host = document.createElement('div');
  host.id = 'mobileControls';
  host.className = 'mobile-controls';
  host.hidden = true;
  host.innerHTML = `
    <div class="mobile-rotate" id="mobileRotate" hidden>
      <div class="mobile-rotate-card" role="dialog" aria-live="polite" aria-label="Draai je telefoon">
        <div class="mobile-rotate-icon" aria-hidden="true">↻</div>
        <p class="mobile-rotate-title">Draai je telefoon om te spelen</p>
        <p class="mobile-rotate-hint">Houd het scherm horizontaal (liggend).</p>
      </div>
    </div>
    <div class="mobile-play-ui" id="mobilePlayUi">
      <div class="mobile-joystick" id="mobileJoystick" aria-label="Besturing">
        <div class="mobile-joystick-base">
          <div class="mobile-joystick-knob" id="mobileJoystickKnob"></div>
        </div>
        <span class="mobile-joystick-label">Rijden</span>
      </div>
      <button type="button" class="mobile-btn mobile-shoot" id="mobileShoot" aria-label="Schieten (Right Trigger)">
        Schiet
      </button>
      <button type="button" class="mobile-btn mobile-intake" id="mobileIntake" aria-label="Intake (Right Bumper)">
        Intake
      </button>
    </div>
  `;
  root.appendChild(host);

  const joy = host.querySelector('#mobileJoystick');
  const knob = host.querySelector('#mobileJoystickKnob');
  const shootBtn = host.querySelector('#mobileShoot');
  const intakeBtn = host.querySelector('#mobileIntake');
  const rotateEl = host.querySelector('#mobileRotate');
  const playUi = host.querySelector('#mobilePlayUi');

  const state = {
    leftStickX: 0,
    leftStickY: 0,
    shoot: false,
    intake: false,
  };

  let activePointer = null;
  let forced = loadForced();
  let visible = false;
  let landscapePlay = false;

  function clampStick(x, y) {
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    if (Math.abs(x) < DEADZONE) x = 0;
    if (Math.abs(y) < DEADZONE) y = 0;
    return { x, y };
  }

  function setKnob(nx, ny) {
    const { x, y } = clampStick(nx, ny);
    state.leftStickX = x;
    state.leftStickY = y;
    knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
  }

  function resetStick() {
    state.leftStickX = 0;
    state.leftStickY = 0;
    knob.style.transform = 'translate(0px, 0px)';
    activePointer = null;
  }

  function clearButtons() {
    setShoot(false);
    setIntake(false);
  }

  function pointerToStick(clientX, clientY) {
    const rect = joy.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * 0.42;
    setKnob((clientX - cx) / radius, (clientY - cy) / radius);
  }

  function onJoyDown(ev) {
    if (!landscapePlay || activePointer != null) return;
    ev.preventDefault();
    const p = ev.changedTouches ? ev.changedTouches[0] : ev;
    activePointer = p.identifier ?? 'mouse';
    joy.classList.add('is-active');
    pointerToStick(p.clientX, p.clientY);
  }

  function onJoyMove(ev) {
    if (activePointer == null) return;
    const list = ev.changedTouches ? [...ev.changedTouches] : [ev];
    const p = list.find((t) => (t.identifier ?? 'mouse') === activePointer);
    if (!p) return;
    ev.preventDefault();
    pointerToStick(p.clientX, p.clientY);
  }

  function onJoyUp(ev) {
    if (activePointer == null) return;
    const list = ev.changedTouches ? [...ev.changedTouches] : [ev];
    const p = list.find((t) => (t.identifier ?? 'mouse') === activePointer);
    if (!p && ev.type !== 'mouseup' && ev.type !== 'mouseleave') return;
    if (ev.type.startsWith('touch') && !p) return;
    ev.preventDefault();
    joy.classList.remove('is-active');
    resetStick();
  }

  joy.addEventListener('mousedown', onJoyDown);
  window.addEventListener('mousemove', onJoyMove);
  window.addEventListener('mouseup', onJoyUp);
  joy.addEventListener('touchstart', onJoyDown, { passive: false });
  window.addEventListener('touchmove', onJoyMove, { passive: false });
  window.addEventListener('touchend', onJoyUp, { passive: false });
  window.addEventListener('touchcancel', onJoyUp, { passive: false });

  function bindHold(btn, setFn) {
    const down = (e) => {
      if (!landscapePlay) return;
      e.preventDefault();
      setFn(true);
    };
    const up = (e) => {
      if (e) e.preventDefault();
      setFn(false);
    };
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', () => setFn(false));
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }

  const setShoot = (on) => {
    state.shoot = !!on;
    shootBtn.classList.toggle('is-pressed', state.shoot);
  };
  const setIntake = (on) => {
    state.intake = !!on;
    intakeBtn.classList.toggle('is-pressed', state.intake);
  };
  bindHold(shootBtn, setShoot);
  bindHold(intakeBtn, setIntake);

  function refreshVisibility() {
    const auto = preferMobilePlay();
    visible = forced == null ? auto : forced;
    host.hidden = !visible;
    host.classList.toggle('is-visible', visible);

    const portrait = isPortrait();
    landscapePlay = visible && preferMobilePlay() && !portrait;

    rotateEl.hidden = !(visible && preferMobilePlay() && portrait);
    playUi.hidden = !landscapePlay;
    host.classList.toggle('needs-rotate', visible && preferMobilePlay() && portrait);
    host.classList.toggle('is-landscape-play', landscapePlay);

    const app = document.getElementById('app');
    const mobilePlay = visible && preferMobilePlay();
    const wasMobilePlay = app?.classList.contains('mobile-play');
    const wasPortrait = app?.classList.contains('mobile-portrait');
    app?.classList.toggle('mobile-play', mobilePlay);
    app?.classList.toggle('mobile-portrait', mobilePlay && portrait);
    app?.classList.toggle('mobile-landscape', landscapePlay);

    if (landscapePlay) tryLockLandscape();

    if (mobilePlay !== wasMobilePlay || (mobilePlay && portrait) !== wasPortrait) {
      try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
      toggleBtn.classList.toggle('is-active', visible);
      toggleBtn.textContent = visible ? 'Touch-besturing aan' : 'Touch-besturing';
    }

    if (!landscapePlay) {
      resetStick();
      clearButtons();
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      forced = !(forced == null ? preferMobilePlay() : forced);
      saveForced(forced);
      refreshVisibility();
      if (forced && preferMobilePlay() && !isPortrait()) tryLockLandscape();
    });
  }

  const onViewport = () => refreshVisibility();
  window.addEventListener('resize', onViewport);
  window.addEventListener('orientationchange', onViewport);
  for (const q of ['(max-width: 700px)', '(max-height: 500px)', '(orientation: portrait)', '(pointer: coarse)']) {
    try { window.matchMedia?.(q)?.addEventListener?.('change', onViewport); } catch { /* ignore */ }
  }

  refreshVisibility();

  return {
    getState() {
      return {
        leftStickX: state.leftStickX,
        leftStickY: state.leftStickY,
        shoot: state.shoot,
        intake: state.intake,
        landscapePlay,
      };
    },
    isVisible() { return visible; },
    isLandscapePlay() { return landscapePlay; },
    setVisible(on) {
      forced = !!on;
      saveForced(forced);
      refreshVisibility();
    },
    destroy() { host.remove(); },
  };
}

export { preferTouch, preferMobilePlay, isPortrait, DEADZONE as MOBILE_STICK_DEADZONE };
