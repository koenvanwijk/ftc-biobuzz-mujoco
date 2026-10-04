const VALUE_BY_CRITERIA = {
  BY_CONTOUR_AREA: 'ContourArea',
  BY_DENSITY: 'Density',
  BY_ASPECT_RATIO: 'AspectRatio',
  BY_ARC_LENGTH: 'ArcLength',
  BY_CIRCULARITY: 'Circularity',
};

export function createColorBlobLocatorAccess(readDetections) {
  const set = (builder, key, value) => {
    if (builder) builder._cfg = { ...(builder._cfg || {}), [key]: value };
  };
  const access = {
    createColorBlobLocatorProcessorBuilder: () => ({ __type: 'ColorBlobLocatorProcessor.Builder', _cfg: {} }),
    buildColorBlobLocatorProcessor: (b) => ({
      __type: 'ColorBlobLocatorProcessor', enabled: true, filters: [],
      ...((b && b._cfg) || {}),
    }),
    addFilter(p, f) { if (p && f) p.filters = [...(p.filters || []), f]; },
    removeFilter(p, f) { if (p) p.filters = (p.filters || []).filter((x) => x !== f); },
    removeAllFilters(p) { if (p) p.filters = []; },
    setSort(p, sort) { if (p) p.sort = sort; },
    createColorBlobLocatorProcessorBlobFilter: (criteria, minValue, maxValue) => ({ criteria, minValue, maxValue }),
    createColorBlobLocatorProcessorBlobSort: (criteria, sortOrder) => ({ criteria, sortOrder }),
    getBlobs(processor) {
      if (processor && processor.enabled === false) return '[]';
      const namedColor = processor && processor.targetColorRange && processor.targetColorRange.name;
      if (namedColor && namedColor !== 'YELLOW') return '[]';
      const snap = readDetections() || { json: '[]' };
      let blobs = typeof snap.json === 'string' ? JSON.parse(snap.json) : (snap.json || []);
      const roi = processor && processor.roi;
      if (roi && roi.units !== 'ENTIRE') {
        const bounds = roi.units === 'UNITY'
          ? { left: 320 * (roi.left + 1), right: 320 * (roi.right + 1), top: 240 * (1 - roi.top), bottom: 240 * (1 - roi.bottom) }
          : roi;
        blobs = blobs.filter((b) => {
          const c = b.Circle && b.Circle.center;
          return c && c.x >= bounds.left && c.x <= bounds.right && c.y >= bounds.top && c.y <= bounds.bottom;
        });
      }
      for (const f of (processor && processor.filters) || []) {
        const key = VALUE_BY_CRITERIA[f.criteria];
        if (key) blobs = blobs.filter((b) => b[key] >= f.minValue && b[key] <= f.maxValue);
      }
      const sort = processor && processor.sort;
      const key = sort && VALUE_BY_CRITERIA[sort.criteria];
      if (key) blobs.sort((a, b) => (sort.sortOrder === 'ASCENDING' ? 1 : -1) * (a[key] - b[key]));
      return JSON.stringify(blobs);
    },
  };
  for (const key of ['DrawContours', 'BoxFitColor', 'CircleFitColor', 'RoiColor', 'ContourColor',
    'TargetColorRange', 'ContourMode', 'Roi', 'BlurSize', 'MorphOperationType', 'ErodeSize', 'DilateSize']) {
    access[`set${key}`] = (builder, value) => set(builder, key.charAt(0).toLowerCase() + key.slice(1), value);
  }
  return access;
}
