/**
 * Schrijft een .blk in FtcBlocksDatabase_MuJoCoSim (zelfde origin).
 * Bij eerste open: vendor/projects-pagina moet DB mogen aanmaken; wij vullen/updaten records.
 */
const DB_NAME = 'FtcBlocksDatabase_MuJoCoSim';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IndexedDB open mislukt'));
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('blkFiles')) {
        db.createObjectStore('blkFiles', { keyPath: 'FileName' }).createIndex(
          'name',
          'name',
          { unique: true },
        );
      }
      if (!db.objectStoreNames.contains('otherFiles')) {
        const os = db.createObjectStore('otherFiles', { keyPath: 'FileName' });
        os.add({ FileName: 'clipboard.xml', Content: '' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function seedBlkProject(projectName, blkContent) {
  const db = await openDb();
  if (!db.objectStoreNames.contains('blkFiles')) {
    db.close();
    throw new Error('blkFiles store ontbreekt — open eerst de Blocks-projectenpagina');
  }
  const fileName = `${projectName}.blk`;
  const record = {
    FileName: fileName,
    Content: blkContent,
    name: projectName,
    escapedName: projectName,
    dateModifiedMillis: Date.now(),
    enabled: true,
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['blkFiles'], 'readwrite');
    const store = tx.objectStore('blkFiles');
    const op = store.put(record);
    op.onsuccess = () => resolve();
    op.onerror = () => reject(op.error);
  });
  db.close();
}
