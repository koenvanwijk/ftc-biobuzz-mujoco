import { publicUrl } from '../../publicUrl.js';
import loadMujoco from '@mujoco/mujoco';

/**
 * Load MuJoCo WASM, pack XML + binary meshes/textures into the Emscripten FS,
 * then return { mujoco, model, data }.
 */
export async function loadBiobuzzSim(onStatus = () => {}) {
  onStatus('MuJoCo WASM laden…');
  const mujoco = await loadMujoco();

  const root = '/working';
  try {
    mujoco.FS.mkdir(root);
  } catch (_) {
    /* exists */
  }
  try {
    mujoco.FS.mkdir(`${root}/meshes`);
  } catch (_) {}
  try {
    mujoco.FS.mkdir(`${root}/textures`);
  } catch (_) {}

  onStatus('Scene XML + assets ophalen…');
  const assetBase = publicUrl('assets');
  const xmlText = await fetchText(`${assetBase}/biobuzz_scene.xml`);
  mujoco.FS.writeFile(`${root}/biobuzz_scene.xml`, xmlText);

  const meshNames = await listFromManifestOrProbe(`${assetBase}/meshes`, MESH_FALLBACK);
  const texNames = await listFromManifestOrProbe(`${assetBase}/textures`, TEX_FALLBACK);

  onStatus(`Meshes laden (${meshNames.length})…`);
  await writeBinaryFiles(mujoco, `${root}/meshes`, `${assetBase}/meshes`, meshNames);

  onStatus(`Textures laden (${texNames.length})…`);
  await writeBinaryFiles(mujoco, `${root}/textures`, `${assetBase}/textures`, texNames);

  onStatus('Model compileren…');
  const model = mujoco.MjModel.mj_loadXML(`${root}/biobuzz_scene.xml`);
  if (!model) {
    throw new Error('MjModel.mj_loadXML mislukt — zie console voor MuJoCo-fouten');
  }
  const data = new mujoco.MjData(model);
  mujoco.mj_resetDataKeyframe(model, data, 0);
  mujoco.mj_forward(model, data);

  return { mujoco, model, data };
}

const MESH_FALLBACK = [
  'hive_frame.stl',
  'hive_frame_hull.stl',
  'hive_red.stl',
  'hive_red_hull.stl',
  'hive_blue.stl',
  'hive_blue_hull.stl',
  'flower_pos_y.stl',
  'flower_pos_y_hull.stl',
  'flower_neg_y.stl',
  'flower_neg_y_hull.stl',
  'flower_neg_x.stl',
  'flower_neg_x_hull.stl',
  'flower_pos_x.stl',
  'flower_pos_x_hull.stl',
  'cell_rim_front.stl',
  'cell_rim_back.stl',
  'cell_shell.stl',
  'cell_back_cap.stl',
];

const TEX_FALLBACK = [
  ...Array.from({ length: 16 }, (_, i) => `apriltag_${30 + i}.png`),
  'cluster_red_scoring.png',
  'cluster_red_audience.png',
  'cluster_blue_audience.png',
  'cluster_blue_scoring.png',
];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch mislukt: ${url} (${res.status})`);
  return res.text();
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch mislukt: ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function writeBinaryFiles(mujoco, vfsDir, urlDir, names) {
  await Promise.all(
    names.map(async (name) => {
      const bytes = await fetchBytes(`${urlDir}/${name}`);
      mujoco.FS.writeFile(`${vfsDir}/${name}`, bytes);
    }),
  );
}

/** Prefer optional manifest.json; otherwise use known fallback list. */
async function listFromManifestOrProbe(urlDir, fallback) {
  try {
    const res = await fetch(`${urlDir}/manifest.json`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.files) && json.files.length) return json.files;
    }
  } catch (_) {}
  return fallback;
}
