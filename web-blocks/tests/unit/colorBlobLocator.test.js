import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createColorBlobLocatorAccess } from '../../src/ftc-runtime/colorBlobLocator.js';
import { opencvAccess } from '../../src/ftc-runtime/opencv.js';

const blobs = [
  { ContourArea: 100, Density: 1, Circle: { center: { x: 100, y: 100 }, radius: 6 } },
  { ContourArea: 400, Density: 1, Circle: { center: { x: 500, y: 300 }, radius: 12 } },
];

describe('ColorBlobLocator simulated runtime', () => {
  it('returns yellow pollen and rejects another predefined color', () => {
    const access = createColorBlobLocatorAccess(() => ({ json: JSON.stringify(blobs) }));
    const builder = access.createColorBlobLocatorProcessorBuilder();
    access.setTargetColorRange(builder, opencvAccess.colorRange('YELLOW'));
    const processor = access.buildColorBlobLocatorProcessor(builder);
    assert.equal(JSON.parse(access.getBlobs(processor)).length, 2);
    processor.targetColorRange = opencvAccess.colorRange('BLUE');
    assert.equal(JSON.parse(access.getBlobs(processor)).length, 0);
  });

  it('applies FTC blob filters, sorting and image ROI', () => {
    const access = createColorBlobLocatorAccess(() => ({ json: JSON.stringify(blobs) }));
    const builder = access.createColorBlobLocatorProcessorBuilder();
    access.setRoi(builder, opencvAccess.asImageCoordinates(0, 0, 320, 240));
    const processor = access.buildColorBlobLocatorProcessor(builder);
    access.addFilter(processor, access.createColorBlobLocatorProcessorBlobFilter('BY_CONTOUR_AREA', 50, 200));
    access.setSort(processor, access.createColorBlobLocatorProcessorBlobSort('BY_CONTOUR_AREA', 'DESCENDING'));
    assert.deepEqual(JSON.parse(access.getBlobs(processor)).map((b) => b.ContourArea), [100]);
  });
});
