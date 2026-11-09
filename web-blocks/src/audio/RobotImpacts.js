/** Sample after EVERY physics substep, not just once per rendered frame. */
export class RobotImpacts {
  constructor(mujoco, model, { separationSeconds = 0.12, cooldownSeconds = 0.15 } = {}) {
    this.model = model;
    this.separationSeconds = separationSeconds;
    this.cooldownSeconds = cooldownSeconds;
    this.robot = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY.value, 'robot');
    this.floor = new Set(['ground', 'tiles'].map((name) => mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM.value, name)));
    // Copy the id tables once (plain JS arrays), instead of going through the WASM getters per lookup.
    this.bodyOf = Array.from(model.geom_bodyid);
    this.parentOf = Array.from(model.body_parentid);
    this.robotGeoms = new Set();
    for (let g = 0; g < model.ngeom; g++) {
      for (let b = this.bodyOf[g]; b > 0; b = this.parentOf[b]) {
        if (b === this.robot) { this.robotGeoms.add(g); break; }
      }
    }
    this.reset();
  }

  reset() {
    this.lastSeen = new Map();
    this.primed = false;
    this.lastImpact = -Infinity;
    this.lastTime = -Infinity;
  }

  sample(data) {
    const time = data.time;
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    const touching = new Set();
    const ncon = data.ncon;
    // `data.contact` returns a NEW std::vector copy on the WASM heap on every access, and
    // `get(i)` returns another copy. Read it once per sample and free both, or the heap
    // grows by ncon² contacts per step until MuJoCo runs out of memory.
    const contacts = ncon > 0 ? data.contact : null;
    try {
      for (let i = 0; i < ncon; i++) {
        const c = contacts.get(i);
        if (!c) continue;
        const a = c.geom1, b = c.geom2;
        const inactive = c.dist > 0 || c.exclude;
        c.delete?.();
        if (inactive || this.robotGeoms.has(a) === this.robotGeoms.has(b)) continue;
        const other = this.robotGeoms.has(a) ? b : a;
        if (this.floor.has(other)) continue;
        // Collapse multiple contact points/geoms on the same field object into one impact.
        let body = this.bodyOf[other];
        while (body > 0 && this.parentOf[body] > 0) body = this.parentOf[body];
        touching.add(body > 0 ? `body:${body}` : `geom:${other}`);
      }
    } finally {
      contacts?.delete?.();
    }
    let impact = false;
    for (const key of touching) {
      const previous = this.lastSeen.get(key);
      if (this.primed && (previous === undefined || time - previous > this.separationSeconds) && time - this.lastImpact >= this.cooldownSeconds) impact = true;
      this.lastSeen.set(key, time);
    }
    for (const [key, seen] of this.lastSeen) {
      if (!touching.has(key) && time - seen > this.separationSeconds) this.lastSeen.delete(key);
    }
    this.primed = true; // Ignore spawn/reset contacts (the robot starts touching a wall).
    if (impact) this.lastImpact = time;
    return impact;
  }
}
