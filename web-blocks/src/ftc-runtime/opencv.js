/** Minimal OpenCV value objects used by the FTC ColorBlobLocator blocks. */
export const opencvAccess = {
  colorRange: (name) => ({ __type: 'ColorRange', name: String(name) }),
  createColorRange: (colorSpace, min, max) => ({ __type: 'ColorRange', colorSpace, min, max }),
  asImageCoordinates: (left, top, right, bottom) => ({ units: 'PIXEL', left, top, right, bottom }),
  asUnityCenterCoordinates: (left, top, right, bottom) => ({ units: 'UNITY', left, top, right, bottom }),
  entireFrame: () => ({ units: 'ENTIRE' }),
  createScalar_with3: (v0, v1, v2) => ({ val: [v0, v1, v2, 0] }),
};
