/**
 * Namen voor AprilTags/tag-clusters in het 3D-veld (hover-tooltip).
 * Cluster = ouder-body van apriltag_body_N in de scene (bijv. red_cell_scoring).
 */

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

/** Tooltiptekst, bijv. "red_cell_scoring – tag 31 (cluster: 30, 31, 32, 33)". */
export function aprilTagLabel(tagId, map) {
  const c = map.get(tagId);
  if (!c) return `AprilTag ${tagId}`;
  return `${c.cluster} – tag ${tagId} (cluster: ${c.tags.join(', ')})`;
}
