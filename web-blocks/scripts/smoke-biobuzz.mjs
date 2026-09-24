/**
 * Headless smoke: load WASM + BIOBUZZ scene, step physics, verify robot moves.
 */
import loadMujoco from '@mujoco/mujoco';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(__dirname, '../public/assets');

const mujoco = await loadMujoco();
const root = '/working';
mujoco.FS.mkdir(root);
mujoco.FS.mkdir(`${root}/meshes`);
mujoco.FS.mkdir(`${root}/textures`);

mujoco.FS.writeFile(
  `${root}/biobuzz_scene.xml`,
  fs.readFileSync(path.join(assets, 'biobuzz_scene.xml'), 'utf8'),
);
for (const f of fs.readdirSync(path.join(assets, 'meshes'))) {
  if (!f.endsWith('.stl')) continue;
  mujoco.FS.writeFile(
    `${root}/meshes/${f}`,
    new Uint8Array(fs.readFileSync(path.join(assets, 'meshes', f))),
  );
}
for (const f of fs.readdirSync(path.join(assets, 'textures'))) {
  if (!f.endsWith('.png')) continue;
  mujoco.FS.writeFile(
    `${root}/textures/${f}`,
    new Uint8Array(fs.readFileSync(path.join(assets, 'textures', f))),
  );
}

const model = mujoco.MjModel.mj_loadXML(`${root}/biobuzz_scene.xml`);
if (!model) throw new Error('mj_loadXML failed');
const data = new mujoco.MjData(model);
mujoco.mj_resetDataKeyframe(model, data, 0);
mujoco.mj_forward(model, data);

const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
const robot = mujoco.mj_name2id(model, BODY, 'robot');
const x0 = data.xpos[robot * 3];

data.ctrl[0] = 6;
data.ctrl[1] = 6;
for (let i = 0; i < 200; i++) mujoco.mj_step(model, data);
const x1 = data.xpos[robot * 3];

console.log(
  JSON.stringify(
    {
      ok: true,
      nbody: model.nbody,
      ngeom: model.ngeom,
      nmesh: model.nmesh,
      nq: model.nq,
      robot_x0: x0,
      robot_x1: x1,
      moved: Math.abs(x1 - x0) > 0.01,
    },
    null,
    2,
  ),
);
if (Math.abs(x1 - x0) <= 0.01) {
  console.error('SMOKE FAIL: robot did not move');
  process.exit(1);
}
console.log('SMOKE OK');
