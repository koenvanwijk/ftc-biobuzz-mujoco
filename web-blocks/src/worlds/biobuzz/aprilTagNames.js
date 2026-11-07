/**
 * Namen voor AprilTags/tag-clusters in het 3D-veld (hover-tooltip).
 * Cluster = ouder-body van apriltag_body_N in de scene (bijv. red_cell_scoring).
 */

import { BIOBUZZ_CLUSTERS } from '../../ftc-runtime/aprilTag.js';

/** Tag-id -> clusternaam zoals in de blokken (bijv. 'RED AUDIENCE'). */
const BLOCK_CLUSTER_BY_ID = new Map();
for (const c of BIOBUZZ_CLUSTERS) for (const id of c.memberIds) BLOCK_CLUSTER_BY_ID.set(id, c);

/** Tagbereik als '34–37' (aaneengesloten) of '30, 32'. */
function formatIds(ids) {
  const s = [...ids].sort((a, b) => a - b);
  const contiguous = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
  return contiguous && s.length > 1 ? `${s[0]}–${s[s.length - 1]}` : s.join(', ');
}

/**
 * @param {{tagId:number, cluster:string}[]} entries
 * @returns {Map<number, {cluster:string, tags:number[]}>}
 */
export function buildTagClusterMap(entries) {
  const byCluster = new Map();
  for (const e of entries) {
    if (!byCluster.has(e.cluster)) byCluster.set(e.cluster, []);
    byCluster.get(e.cluster).push(e.tagId);
  }
  const out = new Map();
  for (const [cluster, tags] of byCluster) {
    tags.sort((a, b) => a - b);
    for (const t of tags) out.set(t, { cluster, tags });
  }
  return out;
}

/** Uit scene-XML: elke apriltag_body_N met de naam van de omsluitende body. */
export function tagEntriesFromXml(xml) {
  const entries = [];
  const stack = [];
  for (const m of xml.matchAll(/<(\/?)body\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const name = (m[2].match(/\sname="([^"]*)"/) || [])[1] || '';
    const t = /^apriltag_body_(\d+)$/.exec(name);
    if (t) entries.push({ tagId: Number(t[1]), cluster: stack[stack.length - 1] || 'world' });
    if (!m[3]) stack.push(name);
  }
  return entries;
}

/** Geom-naam -> tag-id, of null. */
export function tagIdFromGeomName(name) {
  const m = /^apriltag_geom_(\d+)$/.exec(name || '');
  return m ? Number(m[1]) : null;
}

/** Tooltiptekst, bijv. "RED AUDIENCE – tag 35 (cluster: 34–37)" (namen uit de Blocks-bibliotheek). */
export function aprilTagLabel(tagId, map) {
  const b = BLOCK_CLUSTER_BY_ID.get(tagId);
  if (b) return `${b.name} – tag ${tagId} (cluster: ${formatIds(b.memberIds)})`;
  const c = map?.get(tagId);
  if (!c) return `AprilTag ${tagId}`;
  return `${c.cluster} – tag ${tagId} (cluster: ${formatIds(c.tags)})`;
}
