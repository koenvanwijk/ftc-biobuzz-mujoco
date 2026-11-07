import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTagClusterMap, tagEntriesFromXml, tagIdFromGeomName, aprilTagLabel } from '../../src/worlds/biobuzz/aprilTagNames.js';

const xml = fs.readFileSync(new URL('../../public/assets/biobuzz_scene.xml', import.meta.url), 'utf8');

describe('AprilTag-namen (hover)', () => {
  const map = buildTagClusterMap(tagEntriesFromXml(xml));
  it('16 tags in 4 HIVE-clusters', () => {
    assert.equal(map.size, 16);
    assert.deepEqual(map.get(31), { cluster: 'red_cell_scoring', tags: [30, 31, 32, 33] });
    assert.equal(map.get(36).cluster, 'red_cell_audience');
    assert.equal(map.get(40).cluster, 'blue_cell_audience');
    assert.equal(map.get(45).cluster, 'blue_cell_scoring');
  });
  it('geom-naam -> tag-id', () => {
    assert.equal(tagIdFromGeomName('apriltag_geom_42'), 42);
    assert.equal(tagIdFromGeomName('chassis'), null);
    assert.equal(tagIdFromGeomName(undefined), null);
  });
  it('blocknamen passen bij de scene-clusters', () => {
    const want = { 30: 'red_cell_scoring', 34: 'red_cell_audience', 38: 'blue_cell_audience', 42: 'blue_cell_scoring' };
    for (const [id, c] of Object.entries(want)) assert.equal(map.get(Number(id)).cluster, c);
  });
  it('label', () => {
    assert.equal(aprilTagLabel(31, map), 'RED SCORING – tag 31 (cluster: 30–33)');
    assert.equal(aprilTagLabel(35, map), 'RED AUDIENCE – tag 35 (cluster: 34–37)');
    assert.equal(aprilTagLabel(40, map), 'BLUE AUDIENCE – tag 40 (cluster: 38–41)');
    assert.equal(aprilTagLabel(45, map), 'BLUE SCORING – tag 45 (cluster: 42–45)');
    assert.equal(aprilTagLabel(99, map), 'AprilTag 99');
  });
});
