import loadMujoco from '@mujoco/mujoco';

/**
 * Laadt MuJoCo WASM + MJCF (patroon overgenomen van ftc-biobuzz-mujoco/web/src/loader.js).
 */
export async function loadRobotSim(sceneUrl, onStatus = () => {}) {
  onStatus('MuJoCo WASM laden…');
  const mujoco = await loadMujoco();

  const root = '/working';
  try {
    mujoco.FS.mkdir(root);
  } catch (_) {
    /* exists */
  }

  onStatus('Scene XML ophalen…');
  const xmlText = await fetchText(sceneUrl);
  const fileName = 'scene.xml';
  mujoco.FS.writeFile(`${root}/${fileName}`, xmlText);

  onStatus('Model compileren…');
  const model = mujoco.MjModel.mj_loadXML(`${root}/${fileName}`);
  if (!model) {
    throw new Error('MjModel.mj_loadXML mislukt — zie console voor MuJoCo-fouten');
  }
  const data = new mujoco.MjData(model);
  mujoco.mj_resetData(model, data);
  mujoco.mj_forward(model, data);

  return { mujoco, model, data };
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch mislukt: ${url} (${res.status})`);
  return res.text();
}
