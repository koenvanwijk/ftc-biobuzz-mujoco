import { it } from 'node:test';
import assert from 'node:assert/strict';
import loadMujoco from '@mujoco/mujoco';
import { RobotImpacts } from '../../src/audio/RobotImpacts.js';

it('reads real MuJoCo WASM contacts and suppresses persistent wall contact', async () => {
  const mj = await loadMujoco();
  mj.FS.writeFile('/audio-contact.xml', `<mujoco><option gravity="0 0 0"/><worldbody>
    <geom name="ground" type="plane" size="4 4 .1"/>
    <geom name="tiles" type="box" pos="0 0 -.1" size="4 4 .05"/>
    <geom name="wall" type="box" pos="1 0 .5" size=".1 1 .5"/>
    <body name="robot" pos="0 0 .5"><freejoint/><geom type="box" size=".1 .1 .1" mass="1"/></body>
    </worldbody></mujoco>`);
  const model = mj.MjModel.mj_loadXML('/audio-contact.xml');
  const data = new mj.MjData(model);
  const impacts = new RobotImpacts(mj, model);
  try {
    mj.mj_forward(model, data);
    assert.equal(impacts.sample(data), false);
    data.qpos[0] = .85;
    data.time = .2;
    mj.mj_forward(model, data);
    assert.ok(data.ncon > 0);
    assert.equal(impacts.sample(data), true);
    for (let i = 0; i < 100; i++) {
      data.time += .002;
      assert.equal(impacts.sample(data), false);
    }
    impacts.reset();
    assert.equal(impacts.sample(data), false);
  } finally { data.delete(); model.delete(); }
});
