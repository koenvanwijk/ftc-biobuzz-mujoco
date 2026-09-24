#!/usr/bin/env node
/**
 * Smoke / checklist + optional BIOBUZZ WASM load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log('✓', m);
const fail = (m) => {
  console.error('✗', m);
  process.exitCode = 1;
};

const mustExist = [
  'vendor/ftc-blocks/VENDOR.md',
  'vendor/ftc-blocks/PATCHES.md',
  'vendor/ftc-blocks/FtcOfflineBlocks.html',
  'vendor/js-interpreter/interpreter.js',
  'robots/REVStarterBot2026/scene.xml',
  'robots/REVStarterBot2026/simulation.json',
  'robots/BIOBUZZ/simulation.json',
  'public/assets/biobuzz_scene.xml',
  'public/assets/meshes/hive_frame.stl',
  'public/assets/textures/apriltag_30.png',
  'src/worlds/biobuzz/mechanisms.js',
  'src/mujoco/BiobuzzHardwareAdapter.js',
  'examples/StarterBot_TankDrive.blk',
  'examples/StarterBot_Mechanisms.blk',
  'examples/StarterBot_EncoderAuto.blk',
  'examples/StarterBot_ImuAprilTag.blk',
  'README.md',
  'ARCHITECTURE.md',
  'INTEGRATION.md',
  'SUPPORT_MATRIX.md',
];

for (const f of mustExist) {
  if (fs.existsSync(path.join(root, f))) ok(f);
  else fail(`missing ${f}`);
}

const vendorHash = '6ccf47709b6ede0c57eb0bd28d19946351d1dd26dd93f49d5925fe101c8a666f';
const vmd = fs.readFileSync(path.join(root, 'vendor/ftc-blocks/VENDOR.md'), 'utf8');
if (vmd.includes(vendorHash)) ok('VENDOR.md SHA-256');
else fail('VENDOR.md hash mismatch');

const patch = fs.readFileSync(path.join(root, 'vendor/ftc-blocks/blocks/project_util.js'), 'utf8');
if (patch.includes('FtcBlocksDatabase_MuJoCoSim')) ok('IndexedDB isolation patch');
else fail('IndexedDB patch missing');

console.log('\n— Unit/integration tests —');
const r = spawnSync('node', ['--test', 'tests/unit/*.test.js', 'tests/integration/*.test.js'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
if (r.status !== 0) fail('tests failed');
else ok('automated tests');

console.log('\n— BIOBUZZ WASM smoke —');
const smokeBio = spawnSync('node', ['scripts/smoke-biobuzz.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (smokeBio.status !== 0) fail('biobuzz smoke failed');
else ok('biobuzz wasm smoke');

console.log(`
## Handmatige browser-checklist
- [ ] npm run dev → http://localhost:5174 BIOBUZZ meshes zichtbaar
- [ ] Idle teleop beweegt robot; HUD hopper/score
- [ ] TankDrive INIT/START beweegt op veld; STOP → teleop terug
- [ ] Mechanisms: intake/flywheel/servo/crServo → hopper/shoot/place/eject of telemetry
- [ ] world=simple fallback laadt
- [ ] ftc-biobuzz-mujoco/web npm run dev (5173) nog intact
`);
