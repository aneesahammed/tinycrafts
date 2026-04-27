const DB_NAME = 'parqview';
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

export async function recordRecent({ name, size }) {
  await withDb((store) => store.put({ name, size, openedAt: Date.now() }));
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
