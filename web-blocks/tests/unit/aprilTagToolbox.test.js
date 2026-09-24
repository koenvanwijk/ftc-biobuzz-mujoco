import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAprilTagAccess } from '../../src/ftc-runtime/aprilTag.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function visionToolboxXml() {
  const src = readFileSync(join(root, 'vendor/ftc-blocks/js/FtcOfflineBlocks.js'), 'utf8');
  const start = src.indexOf('<category name="Vision">');
  const end = src.indexOf('<category name="Other Devices">', start);
  assert.ok(start >= 0 && end > start, 'Vision toolbox category should exist');
  return src.slice(start, end);
}

function expectBlock(xml, type, prop = null) {
  const marker = '<block type="' + type + '"';
  const start = xml.indexOf(marker);
  assert.ok(start >= 0, 'missing toolbox block: ' + type);
  if (prop != null) {
    const close = xml.indexOf('</block>', start);
    const chunk = xml.slice(start, close + 8);
    assert.ok(
      chunk.includes('<field name="PROP">' + prop + '</field>'),
      'missing toolbox preset ' + type + '.' + prop,
    );
  }
}

describe('AprilTag Vision toolbox', () => {
  it('exposes the practical SDK 12 BIOBUZZ cluster block set', () => {
    const xml = visionToolboxXml();

    for (const type of [
      'aprilTagProcessor_easyCreateWithDefaults',
      'aprilTagProcessorBuilder_create_assign',
      'aprilTagProcessorBuilder_setTagLibrary',
      'aprilTagProcessorBuilder_build',
      'aprilTagProcessor_getDetections',
      'aprilTagProcessor_getFreshDetections',
      'aprilTagProcessor_setDecimation',
      'aprilTagProcessor_setPoseSolver',
      'aprilTagSingleDetection_getProperty_AprilTagMetadata',
      'aprilTagClusterDetection_getProperty_AprilTagClusterMetadata',
      'aprilTagClusterMetadata_getProperty_DistanceUnit',
      'aprilTagClusterMetadata_getProperty_VectorF',
      'aprilTagClusterMetadata_getProperty_Quaternion',
      'aprilTagGameDatabase_getCurrentGameTagLibrary',
      'aprilTagGameDatabase_getBioBuzzTagLibrary',
    ]) {
      expectBlock(xml, type);
    }

    for (const prop of [
      'ftcPose.x',
      'ftcPose.y',
      'ftcPose.z',
      'ftcPose.pitch',
      'ftcPose.roll',
      'ftcPose.yaw',
      'ftcPose.bearing',
      'ftcPose.elevation',
      'ftcPose.range',
    ]) {
      expectBlock(xml, 'aprilTagDetection2_getProperty_Number', prop);
    }

    expectBlock(xml, 'aprilTagDetection2_getProperty_Boolean', 'isSingleDetection');
    expectBlock(xml, 'aprilTagDetection2_getProperty_Boolean', 'isClusterDetection');
    expectBlock(xml, 'aprilTagSingleDetection_getProperty_Number', 'id');
    expectBlock(xml, 'aprilTagSingleDetection_getProperty_String', 'metadata.name');
    expectBlock(xml, 'aprilTagClusterDetection_getProperty_Number', 'percentClusterFound');
    expectBlock(xml, 'aprilTagClusterDetection_getProperty_String', 'metadata.name');
    expectBlock(xml, 'aprilTagClusterDetection_getProperty_String', 'metadata.shortName');
    expectBlock(xml, 'aprilTagClusterMetadata_getProperty_String', 'name');
    expectBlock(xml, 'aprilTagClusterMetadata_getProperty_String', 'shortName');
    expectBlock(xml, 'aprilTagClusterMetadata_getProperty_VectorF', 'fieldPosition');
    expectBlock(xml, 'aprilTagClusterMetadata_getProperty_Quaternion', 'fieldOrientation');
  });
});

describe('AprilTag game database runtime', () => {
  it('returns BIOBUZZ clusters and current-game sample tags', () => {
    const access = createAprilTagAccess(() => ({ json: '[]', generation: 0 }));

    const bio = access.getBioBuzzTagLibrary();
    assert.equal(bio.tags.length, 0);
    assert.equal(bio.clusters.length, 4);
    assert.deepEqual(bio.clusters[0], {
      name: 'RED SCORING',
      shortName: 'RS',
      memberIds: [30, 31, 32, 33],
    });

    const current = access.getCurrentGameTagLibrary();
    assert.equal(current.clusters.length, 4);
    assert.deepEqual(current.tags.map((t) => t.id), [583, 584, 585, 586]);

    const nemo = JSON.parse(access.lookupTag(current, 583));
    assert.equal(nemo.name, 'Nemo');
    assert.equal(nemo.distanceUnit, 'INCH');
    assert.equal(JSON.parse(access.lookupTag(bio, 30)), null);
  });
});
