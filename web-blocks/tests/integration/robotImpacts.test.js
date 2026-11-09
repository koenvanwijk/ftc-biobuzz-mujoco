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

it('reads the contact vector at most once per sample (no WASM heap growth)', async () => {
  const mj = await loadMujoco();
  const balls = Array.from({ length: 40 }, (_, i) =>
    `<body pos="${(i % 8) * 0.06 - 0.2} ${Math.floor(i / 8) * 0.06 - 0.12} .03"><freejoint/><geom type="sphere" size=".03" mass=".05"/></body>`).join('');
  mj.FS.writeFile('/audio-leak.xml', `<mujoco><worldbody>
    <geom name="ground" type="plane" size="4 4 .1"/>
    <body name="robot" pos="0 0 .2"><freejoint/><geom type="box" size=".3 .3 .05" mass="1"/></body>
    ${balls}</worldbody></mujoco>`);
  const model = mj.MjModel.mj_loadXML('/audio-leak.xml');
  const data = new mj.MjData(model);
  const impacts = new RobotImpacts(mj, model);
  try {
    for (let i = 0; i < 200; i++) { mj.mj_step(model, data); impacts.sample(data); }
    assert.ok(data.ncon > 20, `expected many contacts, got ${data.ncon}`);
    // `data.contact` copies the whole contact vector onto the WASM heap on every access;
    // reading it per contact grew the heap by ncon² per step until the browser sim crashed
    // ("memory access out of bounds" in MjData::ctrl). Read it at most once per sample.
    let reads = 0;
    const counted = new Proxy(data, {
      get(target, key) {
        if (key === 'contact') reads++;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    for (let i = 0; i < 2000; i++) {
      mj.mj_step(model, data);
      const before = reads;
      impacts.sample(counted);
      assert.ok(reads - before <= 1, `data.contact read ${reads - before}x in one sample`);
    }
  } finally { data.delete(); model.delete(); }
});
