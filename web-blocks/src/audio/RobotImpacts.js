/** Sample after EVERY physics substep, not just once per rendered frame. */
export class RobotImpacts {
  constructor(mujoco, model, { separationSeconds = 0.12, cooldownSeconds = 0.15 } = {}) {
    this.model = model;
    this.separationSeconds = separationSeconds;
    this.cooldownSeconds = cooldownSeconds;
    this.robot = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY.value, 'robot');
    this.floor = new Set(['ground', 'tiles'].map((name) => mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM.value, name)));
    this.robotGeoms = new Set();
    for (let g = 0; g < model.ngeom; g++) {
      for (let b = model.geom_bodyid[g]; b > 0; b = model.body_parentid[b]) {
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
    for (let i = 0; i < data.ncon; i++) {
      const c = data.contact.get(i);
      const a = c.geom1, b = c.geom2;
      const inactive = c.dist > 0 || c.exclude;
      c.delete?.(); // Release the Embind wrapper, not the MuJoCo-owned contact data.
      if (inactive || this.robotGeoms.has(a) === this.robotGeoms.has(b)) continue;
      const other = this.robotGeoms.has(a) ? b : a;
      if (this.floor.has(other)) continue;
      // Collapse multiple contact points/geoms on the same field object into one impact.
      let body = this.model.geom_bodyid[other];
      while (body > 0 && this.model.body_parentid[body] > 0) body = this.model.body_parentid[body];
      touching.add(body > 0 ? `body:${body}` : `geom:${other}`);
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
