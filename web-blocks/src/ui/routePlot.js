/**
 * 2D bovenaanzicht van de gereden route (wereldcoördinaten van de sim, meters).
 * Pure helpers (RouteTracker, distanceColor) zijn testbaar zonder DOM.
 */

export const FIELD_SIZE_M = 3.66;
const HALF = FIELD_SIZE_M / 2;
import { worldToFtc, ftcToWorld } from './fieldElements.js';

/** Kleurverloop blauw -> geel -> rood voor t in [0,1]; geeft [r,g,b]. */
export function gradientRgb(t) {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const stops = [[30, 90, 255], [255, 220, 0], [230, 30, 30]];
  const s = u * 2;
  const i = Math.min(1, Math.floor(s));
  const f = s - i;
  const a = stops[i], b = stops[i + 1];
  return a.map((c, k) => Math.round(c + (b[k] - c) * f));
}

/** Kleur voor een afstand d bij maximale afstand max. */
export function distanceColor(d, max) {
  const [r, g, b] = gradientRgb(max > 0 ? d / max : 0);
  return `rgb(${r},${g},${b})`;
}

/** Verzamelt route-punten met cumulatieve afgelegde afstand. */
export class RouteTracker {
  constructor({ minStep = 0.005, maxPoints = 20000 } = {}) {
    this.minStep = minStep;
    this.maxPoints = maxPoints;
    this.reset();
  }
  reset() {
    /** @type {{x:number,y:number,d:number}[]} */
    this.points = [];
    this.total = 0;
    this.current = null;
  }
  /** Voeg een pose toe; punten dichter dan minStep bij het vorige worden overgeslagen. */
  add(x, y, yawRad = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    this.current = { x, y, yaw: yawRad };
    const last = this.points[this.points.length - 1];
    if (!last) {
      this.points.push({ x, y, d: 0 });
      return true;
    }
    const step = Math.hypot(x - last.x, y - last.y);
    if (step < this.minStep) return false;
    this.total += step;
    this.points.push({ x, y, d: this.total });
    if (this.points.length > this.maxPoints) {
      // Decimeer: elk tweede punt behouden (afstanden blijven kloppen).
      this.points = this.points.filter((_, i, arr) => i % 2 === 0 || i === arr.length - 1);
    }
    return true;
  }
}

/** Mooie tick-afstand voor een bereik. */
export function niceTicks(min, max, step = 0.5) {
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
}

/** Canvas-renderer; tekent veld, assen, route en robotmarker. */
export class RoutePlot {
  constructor(canvas, tracker = new RouteTracker()) {
    this.canvas = canvas;
    this.tracker = tracker;
    this.dirty = true;
    /** @type {{x:number,y:number}[]} */
    this.waypoints = [];
    this.drawMode = false;
    /** Voorbeeldpunt (sim-coördinaten) tijdens hover in tekenmodus. */
    this.preview = null;
    /** @type {ReturnType<import('./fieldElements.js').parseFieldElements> | null} */
    this.field = null;
    this._map = null;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => { this.dirty = true; this.draw(); });
      this._ro.observe(canvas);
    }
  }
  reset() { this.tracker.reset(); this.dirty = true; this.draw(); }
  redraw() { this.dirty = true; this.draw(); }
  /** CSS-pixels (t.o.v. canvas) -> veld-meters, of null buiten het plotvlak. */
  toWorld(px, py) {
    const m = this._map;
    if (!m) return null;
    const x = ((px - m.ox) / m.plot) * 2 * m.range - m.range;
    const y = m.range - ((py - m.oy) / m.plot) * 2 * m.range;
    if (Math.abs(x) > HALF || Math.abs(y) > HALF) return null;
    return ftcToWorld(x, y);
  }
  add(x, y, yaw) { if (this.tracker.add(x, y, yaw)) this.dirty = true; else if (this.tracker.current) this.dirty = true; }
  draw() {
    const c = this.canvas;
    if (!c || !this.dirty) return;
    const cssW = c.clientWidth, cssH = c.clientHeight;
    if (!cssW || !cssH) return;
    this.dirty = false;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) {
      c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const legendW = 46, padL = 38, padB = 30, padT = 10;
    const plot = Math.max(10, Math.min(cssW - padL - legendW - 8, cssH - padB - padT));
    const ox = padL, oy = padT;
    const range = HALF + 0.07;
    const sx = (x) => ox + ((x + range) / (2 * range)) * plot;
    const sy = (y) => oy + ((range - y) / (2 * range)) * plot;
    this._map = { ox, oy, plot, range };
    // Wereld (sim) -> scherm via FTC-coördinaten.
    const sp = (x, y) => { const f = worldToFtc(x, y); return [sx(f.x), sy(f.y)]; };
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#111'; ctx.fillRect(ox, oy, plot, plot);
    // Raster + ticks
    const ticks = niceTicks(-HALF, HALF, 0.5);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of ticks) {
      ctx.beginPath(); ctx.moveTo(sx(t), oy); ctx.lineTo(sx(t), oy + plot); ctx.stroke();
      ctx.fillText(t.toFixed(1), sx(t), oy + plot + 2);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of ticks) {
      ctx.beginPath(); ctx.moveTo(ox, sy(t)); ctx.lineTo(ox + plot, sy(t)); ctx.stroke();
      ctx.fillText(t.toFixed(1), ox - 3, sy(t));
    }
    // Assen door oorsprong
    ctx.strokeStyle = '#777'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx(-range), sy(0)); ctx.lineTo(sx(range), sy(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(0), sy(-range)); ctx.lineTo(sx(0), sy(range)); ctx.stroke();
    ctx.fillStyle = '#ddd'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('X_ftc (m) \u2192 publiek', ox + plot / 2, oy + plot + 15);
    ctx.save(); ctx.translate(9, oy + plot / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle'; ctx.fillText('Y_ftc (m) \u2192 blauw', 0, 0); ctx.restore();
    // Veldrand
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2;
    ctx.strokeRect(sx(-HALF), sy(HALF), sx(HALF) - sx(-HALF), sy(-HALF) - sy(HALF));
    // Statische veldelementen (uit scene-XML)
    const fe = this.field;
    if (fe) {
      for (const p of fe.posts) {
        const [qx, qy] = sp(p.x, p.y);
        ctx.fillStyle = p.alliance === 'red' ? '#e33' : p.alliance === 'blue' ? '#38f' : '#999'; ctx.beginPath(); ctx.arc(qx, qy, Math.max(2.5, (p.r / (2 * range)) * plot), 0, Math.PI * 2); ctx.fill();
      }
      for (const f of fe.flowers) {
        const [qx, qy] = sp(f.x, f.y);
        ctx.strokeStyle = '#f0f'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(qx, qy, Math.max(3, (f.r / (2 * range)) * plot), 0, Math.PI * 2); ctx.stroke();
      }
      for (const st of fe.starts) {
        const [qx, qy] = sp(st.x, st.y);
        const k = plot / (2 * range);
        ctx.save(); ctx.translate(qx, qy); ctx.rotate(-((st.yawDeg * Math.PI) / 180 + Math.PI / 2));
        ctx.strokeStyle = st.alliance === 'red' ? '#e33' : '#38f'; ctx.lineWidth = 1.5;
        ctx.strokeRect(-st.hx * k, -st.hy * k, 2 * st.hx * k, 2 * st.hy * k);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(st.hx * k, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.font = '10px ui-monospace, monospace';
    }
    // Route
    const pts = this.tracker.points, max = this.tracker.total;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = distanceColor(pts[i].d, max);
      ctx.beginPath(); ctx.moveTo(...sp(pts[i - 1].x, pts[i - 1].y)); ctx.lineTo(...sp(pts[i].x, pts[i].y)); ctx.stroke();
    }
    // Getekende waypoints (gestippeld, genummerd)
    const wp = this.waypoints;
    if (wp.length) {
      ctx.save();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      wp.forEach((p, i) => (i ? ctx.lineTo(...sp(p.x, p.y)) : ctx.moveTo(...sp(p.x, p.y))));
      ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 9px sans-serif';
      wp.forEach((p, i) => {
        ctx.fillStyle = i ? '#0a0' : '#06c';
        const [qx, qy] = sp(p.x, p.y);
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(i ? String(i) : 'S', qx, qy);
      });
      ctx.restore();
    }
    // Voorbeeld van het volgende (evt. gesnapte) punt
    if (this.preview && wp.length) {
      const [ax, ay] = sp(wp[wp.length - 1].x, wp[wp.length - 1].y);
      const [bx, by] = sp(this.preview.x, this.preview.y);
      ctx.save();
      ctx.setLineDash([3, 3]); ctx.strokeStyle = this.preview.snapped ? '#0ff' : 'rgba(0,255,0,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Robotmarker (driehoek in kijkrichting)
    const cur = this.tracker.current;
    if (cur) {
      const [px, py] = sp(cur.x, cur.y), a = -(cur.yaw + Math.PI / 2), r = 8;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + r * Math.cos(a), py + r * Math.sin(a));
      ctx.lineTo(px + r * 0.7 * Math.cos(a + 2.5), py + r * 0.7 * Math.sin(a + 2.5));
      ctx.lineTo(px + r * 0.7 * Math.cos(a - 2.5), py + r * 0.7 * Math.sin(a - 2.5));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Legenda
    const lx = ox + plot + 12, lh = plot * 0.8, ly = oy + (plot - lh) / 2;
    const grad = ctx.createLinearGradient(0, ly + lh, 0, ly);
    [0, 0.5, 1].forEach((t) => { const [r, g, b] = gradientRgb(t); grad.addColorStop(t, `rgb(${r},${g},${b})`); });
    ctx.fillStyle = grad; ctx.fillRect(lx, ly, 10, lh);
    ctx.fillStyle = '#ccc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${max.toFixed(2)}`, lx + 13, ly);
    ctx.fillText(`${(max / 2).toFixed(2)}`, lx + 13, ly + lh / 2);
    ctx.fillText('0', lx + 13, ly + lh);
    ctx.textBaseline = 'bottom'; ctx.fillText('m', lx, ly - 3);
  }
}
