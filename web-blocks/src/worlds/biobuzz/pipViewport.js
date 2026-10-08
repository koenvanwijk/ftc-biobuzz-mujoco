/**
 * Hoofdbeeld + robotcamera-PiP in één WebGL-canvas, met viewport/scissor.
 *
 * Let op de eenheden: three.js `WebGLRenderer.setViewport()` en `setScissor()` nemen **CSS-pixels**
 * en vermenigvuldigen zelf met `getPixelRatio()`. Alles in dit bestand is daarom in CSS-pixels;
 * nooit zelf met devicePixelRatio vermenigvuldigen (anders is het hoofdbeeld op een scherm met
 * devicePixelRatio > 1 verkeerd ingezoomd en valt de PiP buiten het canvas).
 *
 * Dit bestand staat identiek in web/src/ en web-blocks/src/worlds/biobuzz/ (test bewaakt dat).
 */

/** Dikte van de cyaan PiP-rand (CSS-px). */
export const PIP_BORDER_CSS = 2;

/** Hoogste pixelratio die de viewers gebruiken (scherpte vs. GPU-kosten). */
export const MAX_PIXEL_RATIO = 2;

/** Pixelratio voor de renderer: devicePixelRatio, begrensd op MAX_PIXEL_RATIO. */
export function viewerPixelRatio(devicePixelRatio) {
  const dpr = Number(devicePixelRatio);
  return Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, MAX_PIXEL_RATIO);
}

/**
 * Rechthoeken voor hoofdbeeld, PiP-rand en PiP-beeld, in CSS-pixels en WebGL-coördinaten
 * (y gemeten vanaf de onderkant van het canvas).
 * @param {{ cw: number, ch: number, pipW: number, pipH: number, margin: number, rightInset: number,
 *   corner?: 'top-right' | 'bottom-right', border?: number }} box
 */
export function pipViewportRects({ cw, ch, pipW, pipH, margin, rightInset, corner = 'top-right', border = PIP_BORDER_CSS }) {
  const x = Math.max(margin, cw - pipW - rightInset - border);
  const y = corner === 'bottom-right' ? margin : Math.max(margin, ch - pipH - margin - border);
  const fx = Math.max(0, x - border);
  const fy = Math.max(0, y - border);
  return {
    main: { x: 0, y: 0, w: cw, h: ch },
    frame: { x: fx, y: fy, w: Math.min(cw - fx, pipW + border * 2), h: Math.min(ch - fy, pipH + border * 2) },
    inset: { x, y, w: pipW, h: pipH },
  };
}

/**
 * CSS-positie (right/top/bottom) voor het PiP-label direct onder (top-right) of boven
 * (bottom-right) de PiP-rand.
 */
export function pipLabelCss(box) {
  const r = pipViewportRects(box);
  const right = box.cw - (r.frame.x + r.frame.w);
  if (box.corner === 'bottom-right') return { right, bottom: r.frame.y + r.frame.h, width: box.pipW };
  return { right, top: box.ch - r.frame.y, width: box.pipW };
}

/**
 * Teken het hoofdbeeld en de PiP. Alle viewport/scissor-waarden zijn CSS-pixels (three.js schaalt).
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ scene, camera, robotCam, box: object, clearColor: number, frameColor: number,
 *   insetColor: number, beforePip?: () => void, afterPip?: () => void }} opts
 */
export function renderWithPip(renderer, { scene, camera, robotCam, box, clearColor, frameColor, insetColor, beforePip, afterPip }) {
  const { main, frame, inset } = pipViewportRects(box);

  renderer.setScissorTest(false);
  renderer.setViewport(main.x, main.y, main.w, main.h);
  renderer.setClearColor(clearColor, 1);
  renderer.autoClear = true;
  renderer.render(scene, camera);

  renderer.setScissorTest(true);
  renderer.autoClear = false;
  // Cyaan rand: grotere clear, daarna het PiP-vlak.
  renderer.setClearColor(frameColor, 1);
  renderer.setViewport(frame.x, frame.y, frame.w, frame.h);
  renderer.setScissor(frame.x, frame.y, frame.w, frame.h);
  renderer.clear(true, true, true);

  renderer.setClearColor(insetColor, 1);
  renderer.setViewport(inset.x, inset.y, inset.w, inset.h);
  renderer.setScissor(inset.x, inset.y, inset.w, inset.h);
  renderer.clear(true, true, true);

  beforePip?.();
  renderer.render(scene, robotCam);
  afterPip?.();

  renderer.autoClear = true;
  renderer.setClearColor(clearColor, 1);
  renderer.setScissorTest(false);
  renderer.setViewport(main.x, main.y, main.w, main.h);
}
