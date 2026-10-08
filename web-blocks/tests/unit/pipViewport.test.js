/**
 * HiDPI: three.js setViewport/setScissor nemen CSS-pixels en vermenigvuldigen zelf met de pixelratio.
 * Bewaakt dat hoofdbeeld en robotcamera-PiP bij devicePixelRatio 1, 1,5 en 2 hetzelfde (CSS-)kader
 * krijgen, binnen het canvas-buffer vallen en dat de renderers niet zelf met dpr vermenigvuldigen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pvBlocks from '../../src/worlds/biobuzz/pipViewport.js';
import * as pvWeb from '../../../web/src/pipViewport.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

/** Nep-WebGLRenderer met three.js-semantiek: viewport/scissor in CSS-px × pixelRatio, afgerond. */
function fakeRenderer(pixelRatio, cw, ch) {
  const calls = [];
  const dev = (x, y, w, h) => [x, y, w, h].map((v) => Math.round(v * pixelRatio));
  return {
    calls,
    autoClear: true,
    buffer: { w: Math.floor(cw * pixelRatio), h: Math.floor(ch * pixelRatio) },
    getPixelRatio: () => pixelRatio,
    setScissorTest: (on) => calls.push(['scissorTest', on]),
    setViewport: (x, y, w, h) => calls.push(['viewport', [x, y, w, h], dev(x, y, w, h)]),
    setScissor: (x, y, w, h) => calls.push(['scissor', [x, y, w, h], dev(x, y, w, h)]),
    setClearColor: (c) => calls.push(['clearColor', c]),
    clear: () => calls.push(['clear']),
    render: (_scene, cam) => calls.push(['render', cam]),
  };
}

const BOXES = [
  { name: 'web-blocks (rechtsboven)', cw: 972, ch: 623, pipW: 233, pipH: 174, margin: 16, rightInset: 24, corner: 'top-right' },
  { name: 'web-blocks portret', cw: 486, ch: 593, pipW: 105, pipH: 140, margin: 16, rightInset: 24, corner: 'top-right' },
  { name: 'web (rechtsonder)', cw: 1280, ch: 800, pipW: 280, pipH: 210, margin: 16, rightInset: 220, corner: 'bottom-right' },
];

describe('PiP-viewport (HiDPI)', () => {
  it('pipViewport.js is identiek in web/ en web-blocks/', () => {
    assert.equal(read('web/src/pipViewport.js'), read('web-blocks/src/worlds/biobuzz/pipViewport.js'));
  });

  it('viewerPixelRatio volgt devicePixelRatio, begrensd op 2', () => {
    for (const pv of [pvBlocks, pvWeb]) {
      assert.equal(pv.viewerPixelRatio(1), 1);
      assert.equal(pv.viewerPixelRatio(1.5), 1.5);
      assert.equal(pv.viewerPixelRatio(2), 2);
      assert.equal(pv.viewerPixelRatio(3), 2);
      assert.equal(pv.viewerPixelRatio(undefined), 1);
      assert.equal(pv.viewerPixelRatio(0), 1);
    }
  });

  it('rechthoeken zijn CSS-pixels: PiP in de juiste hoek met de juiste insets', () => {
    const B = pvBlocks.PIP_BORDER_CSS;
    for (const box of BOXES) {
      const r = pvBlocks.pipViewportRects(box);
      assert.deepEqual(r.main, { x: 0, y: 0, w: box.cw, h: box.ch }, box.name);
      assert.equal(r.inset.w, box.pipW);
      assert.equal(r.inset.h, box.pipH);
      assert.equal(box.cw - (r.inset.x + r.inset.w), box.rightInset + B, `${box.name}: rechts`);
      if (box.corner === 'top-right') assert.equal(box.ch - (r.inset.y + r.inset.h), box.margin + B, `${box.name}: boven`);
      else assert.equal(r.inset.y, box.margin, `${box.name}: onder`);
      assert.deepEqual(r.frame, { x: r.inset.x - B, y: r.inset.y - B, w: box.pipW + 2 * B, h: box.pipH + 2 * B });
    }
  });

  for (const ratio of [1, 1.5, 2]) {
    it(`renderWithPip bij pixelratio ${ratio}: hoofdbeeld vult het buffer, PiP valt erbinnen op schaal`, () => {
      for (const box of BOXES) {
        const rd = fakeRenderer(ratio, box.cw, box.ch);
        const order = [];
        pvBlocks.renderWithPip(rd, {
          scene: 'scene', camera: 'main', robotCam: 'pip', box,
          clearColor: 1, frameColor: 2, insetColor: 3,
          beforePip: () => order.push('before'), afterPip: () => order.push('after'),
        });
        const vps = rd.calls.filter((c) => c[0] === 'viewport');
        // Hoofdbeeld: CSS (0,0,cw,ch) → device = hele buffer (±1 px afronding).
        assert.deepEqual(vps[0][1], [0, 0, box.cw, box.ch], `${box.name}: hoofdviewport in CSS-px`);
        assert.ok(Math.abs(vps[0][2][2] - rd.buffer.w) <= 1 && Math.abs(vps[0][2][3] - rd.buffer.h) <= 1, `${box.name}: vult buffer`);
        // PiP (inset = 3e viewport) in device-px binnen het buffer, rechtsboven/-onder, grootte = pipW·ratio.
        const [ix, iy, iw, ih] = vps[2][2];
        assert.ok(ix >= 0 && iy >= 0 && ix + iw <= rd.buffer.w && iy + ih <= rd.buffer.h, `${box.name} @${ratio}: PiP binnen buffer`);
        assert.ok(Math.abs(iw - box.pipW * ratio) <= 1 && Math.abs(ih - box.pipH * ratio) <= 1, `${box.name} @${ratio}: PiP-maat`);
        assert.ok(Math.abs(rd.buffer.w - (ix + iw) - (box.rightInset + 2) * ratio) <= 2, `${box.name} @${ratio}: rechter inset`);
        if (box.corner === 'top-right') assert.ok(Math.abs(rd.buffer.h - (iy + ih) - (box.margin + 2) * ratio) <= 2, 'boven');
        // Scissor = viewport voor rand en PiP; laatste viewport zet het hoofdbeeld terug.
        const sc = rd.calls.filter((c) => c[0] === 'scissor');
        assert.deepEqual(sc.map((c) => c[1]), [vps[1][1], vps[2][1]]);
        assert.deepEqual(vps.at(-1)[1], [0, 0, box.cw, box.ch]);
        assert.deepEqual(rd.calls.filter((c) => c[0] === 'render').map((c) => c[1]), ['main', 'pip']);
        assert.deepEqual(order, ['before', 'after']);
        assert.equal(rd.autoClear, true);
      }
    });
  }

  it('pipLabelCss sluit aan op de cyaan rand', () => {
    const B = pvBlocks.PIP_BORDER_CSS;
    const [tr, , br] = BOXES;
    assert.deepEqual(pvBlocks.pipLabelCss(tr), { right: tr.rightInset, top: tr.margin + tr.pipH + 2 * B, width: tr.pipW });
    assert.deepEqual(pvBlocks.pipLabelCss(br), { right: br.rightInset, bottom: br.margin + br.pipH + B, width: br.pipW });
  });

  it('renderers vermenigvuldigen viewport/scissor niet zelf met de pixelratio', () => {
    for (const p of ['web/src/renderer.js', 'web-blocks/src/worlds/biobuzz/renderer.js']) {
      const src = read(p);
      assert.ok(!/\.set(Viewport|Scissor)\(/.test(src), `${p}: viewport/scissor alleen via renderWithPip`);
      assert.ok(/renderWithPip\(this\.renderer/.test(src), `${p}: gebruikt renderWithPip`);
      assert.ok(/viewerPixelRatio\(window\.devicePixelRatio\)/.test(src), `${p}: pixelratio via viewerPixelRatio`);
      assert.ok(!/\*\s*dpr/.test(src.replace(/Math\.floor\(box\.c[wh] \* dpr\)/g, '')), `${p}: geen eigen × dpr`);
    }
  });
});
