const DB_NAME = 'dataduck';
const STORE = 'recents';
const MAX_RECENTS = 5;

function withDb(fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      Promise.resolve(fn(store)).then((value) => {
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function recordRecent({ name, size, file = null, format = null, csvMode = null }) {
  const openedAt = Date.now();
  const record = { name, size, openedAt, format, csvMode };
  if (file) {
    try {
      await withDb((store) => store.put({ ...record, file }));
      return;
    } catch (error) {
      console.warn('Could not store recent file snapshot:', error);
    }
  }

  await withDb((store) => store.put(record));
}

export async function listRecents() {
  return withDb(
    (store) =>
      new Promise((resolve) => {
        const out = [];
        const cursor = store.openCursor();
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (!c) {
            resolve(out.sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_RECENTS));
            return;
          }
          out.push(c.value);
          c.continue();
        };
      }),
  );
}

export async function clearRecents() {
  await withDb((store) => store.clear());
}

export async function getRecentFile(name) {
  return (await getRecentFileRecord(name))?.file || null;
}

export async function getRecentFileRecord(name) {
  const record = await withDb(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.get(name);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }),
  );

  if (!record?.file) return null;
  return {
    name: record.name,
    size: record.size,
    openedAt: record.openedAt,
    format: record.format || null,
    csvMode: record.csvMode || null,
    file: normalizeStoredFile(record),
  };
}

function normalizeStoredFile(record) {
  if (record.file instanceof File) return record.file;
  if (record.file instanceof Blob) {
    return new File([record.file], record.name, { type: record.file.type || 'application/octet-stream' });
  }
  return null;
}
