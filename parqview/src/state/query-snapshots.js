export const DB_NAME = 'parqview-query-snapshots';
export const STORE = 'snapshots';
export const DB_VERSION = 1;
export const MAX_UNPINNED_SNAPSHOTS = 20;
export const MAX_PINNED_SNAPSHOTS = 50;
export const SQL_MAX_CHARS = 64 * 1024;

let memorySnapshots = [];
let lastTimestamp = 0;
let storageStatus = { mode: 'indexeddb', degraded: false, reason: null };

export class QuerySnapshotError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'QuerySnapshotError';
    this.code = code;
  }
}

export function createQuerySnapshot({
  sql,
  activeTable = null,
  rowCount = 0,
  elapsedMs = 0,
  columns = [],
  now = () => Date.now(),
  randomUUID = () => crypto?.randomUUID?.(),
} = {}) {
  const text = String(sql || '');
  if (!text.trim()) return null;
  if (text.length > SQL_MAX_CHARS) return null;

  const ranAt = nextSnapshotTimestamp(now);
  const id = randomUUID?.() || `qs_${ranAt}_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    sql: text,
    title: deriveSnapshotTitle(text, ranAt),
    activeTable,
    rowCount: normalizeInteger(rowCount),
    elapsedMs: normalizeInteger(elapsedMs),
    columns: Array.isArray(columns) ? columns.map(String) : [],
    ranAt,
    pinned: false,
    pinnedAt: null,
  };
}

export function deriveSnapshotTitle(sql, ranAt = Date.now()) {
  const fallback = `Query at ${clockTime(ranAt)}`;
  const lines = String(sql || '').replace(/\r\n?/g, '\n').split('\n');

  for (const rawLine of lines) {
    let line = rawLine.trim().replace(/^;+/, '').trim();
    if (!line || line.startsWith('--')) continue;
    line = line.replace(/\s+/g, ' ');
    if (/^WITH\b/i.test(line)) return 'WITH query';
    const title = (line.split(';')[0] || line).trim();
    return truncateTitle(title || fallback);
  }

  return fallback;
}

export function seedSnapshotClock(snapshots = []) {
  lastTimestamp = snapshots.reduce((max, item) => Math.max(max, normalizeInteger(item.ranAt)), 0);
}

export function sortQuerySnapshots(snapshots = []) {
  return [...snapshots].sort((a, b) => {
    const ap = Boolean(a.pinned);
    const bp = Boolean(b.pinned);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) {
      const pinnedDelta = normalizeInteger(b.pinnedAt) - normalizeInteger(a.pinnedAt);
      if (pinnedDelta) return pinnedDelta;
    }
    const ranDelta = normalizeInteger(b.ranAt) - normalizeInteger(a.ranAt);
    if (ranDelta) return ranDelta;
    return String(b.id).localeCompare(String(a.id));
  });
}

export function pruneQuerySnapshots(snapshots = []) {
  const normalized = sortQuerySnapshots(snapshots.map(normalizeSnapshot).filter(Boolean));
  const pinned = normalized.filter((item) => item.pinned).slice(0, MAX_PINNED_SNAPSHOTS);
  const unpinned = normalized.filter((item) => !item.pinned).slice(0, MAX_UNPINNED_SNAPSHOTS);
  return sortQuerySnapshots([...pinned, ...unpinned]);
}

export async function listQuerySnapshots() {
  const snapshots = await readSnapshots();
  const sorted = sortQuerySnapshots(snapshots);
  seedSnapshotClock(sorted);
  return sorted;
}

export async function recordQuerySnapshot(snapshot) {
  if (!snapshot) return listQuerySnapshots();
  const next = pruneQuerySnapshots([...await readSnapshots(), normalizeSnapshot(snapshot)]);
  await writeSnapshots(next);
  return sortQuerySnapshots(next);
}

export async function replaceQuerySnapshots(snapshots) {
  const next = pruneQuerySnapshots(snapshots);
  await writeSnapshots(next);
  return sortQuerySnapshots(next);
}

export async function deleteQuerySnapshot(id) {
  const next = (await readSnapshots()).filter((item) => item.id !== id);
  await writeSnapshots(next);
  return sortQuerySnapshots(next);
}

export async function clearQuerySnapshots() {
  memorySnapshots = [];
  await writeSnapshots([]);
  return [];
}

export async function setQuerySnapshotPinned(id, pinned) {
  const snapshots = await readSnapshots();
  const target = snapshots.find((item) => item.id === id);
  if (!target) return sortQuerySnapshots(snapshots);
  if (pinned && !target.pinned) {
    const pinnedCount = snapshots.filter((item) => item.pinned).length;
    if (pinnedCount >= MAX_PINNED_SNAPSHOTS) {
      throw new QuerySnapshotError(`You can pin up to ${MAX_PINNED_SNAPSHOTS} query snapshots.`, 'PIN_LIMIT');
    }
  }
  const next = pruneQuerySnapshots(
    snapshots.map((item) =>
      item.id === id
        ? {
            ...item,
            pinned,
            pinnedAt: pinned ? nextSnapshotTimestamp(() => Date.now()) : null,
          }
        : item,
    ),
  );
  await writeSnapshots(next);
  return sortQuerySnapshots(next);
}

export function getQuerySnapshotStorageStatus() {
  return { ...storageStatus };
}

async function readSnapshots() {
  if (!hasIndexedDb()) return readMemory(new Error('IndexedDB unavailable'));
  try {
    return await withDb('readonly', (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []).map(normalizeSnapshot).filter(Boolean));
        req.onerror = () => reject(req.error);
      }),
    );
  } catch (error) {
    return readMemory(error);
  }
}

async function writeSnapshots(snapshots) {
  const next = pruneQuerySnapshots(snapshots);
  memorySnapshots = next;
  if (!hasIndexedDb()) {
    markStorageDegraded(new Error('IndexedDB unavailable'));
    return;
  }
  try {
    await withDb('readwrite', (store) =>
      new Promise((resolve, reject) => {
        const clear = store.clear();
        clear.onerror = () => reject(clear.error);
        clear.onsuccess = () => {
          if (!next.length) {
            resolve();
            return;
          }
          let pending = next.length;
          for (const item of next) {
            const req = store.put(item);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              pending -= 1;
              if (pending === 0) resolve();
            };
          }
        };
      }),
    );
    storageStatus = { mode: 'indexeddb', degraded: false, reason: null };
  } catch (error) {
    markStorageDegraded(error);
  }
}

function withDb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onblocked = () => reject(new Error('Query snapshot storage upgrade is blocked by another tab.'));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      Promise.resolve(fn(store))
        .then((value) => {
          tx.oncomplete = () => {
            db.close();
            resolve(value);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
        .catch((error) => {
          db.close();
          reject(error);
        });
    };
  });
}

function readMemory(error) {
  markStorageDegraded(error);
  return sortQuerySnapshots(memorySnapshots);
}

function markStorageDegraded(error) {
  storageStatus = {
    mode: 'memory',
    degraded: true,
    reason: error?.name || error?.message || String(error || 'Storage unavailable'),
  };
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined' && indexedDB?.open;
}

function nextSnapshotTimestamp(now) {
  const raw = Number(typeof now === 'function' ? now() : Date.now());
  const base = Number.isFinite(raw) ? Math.trunc(raw) : Date.now();
  lastTimestamp = Math.max(base, lastTimestamp + 1);
  return lastTimestamp;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || !snapshot.id || !snapshot.sql) return null;
  const ranAt = normalizeInteger(snapshot.ranAt);
  return {
    id: String(snapshot.id),
    sql: String(snapshot.sql),
    title: snapshot.title ? String(snapshot.title) : deriveSnapshotTitle(snapshot.sql, ranAt),
    activeTable: snapshot.activeTable == null ? null : String(snapshot.activeTable),
    rowCount: normalizeInteger(snapshot.rowCount),
    elapsedMs: normalizeInteger(snapshot.elapsedMs),
    columns: Array.isArray(snapshot.columns) ? snapshot.columns.map(String) : [],
    ranAt,
    pinned: Boolean(snapshot.pinned),
    pinnedAt: snapshot.pinned ? normalizeInteger(snapshot.pinnedAt || snapshot.ranAt) : null,
  };
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function truncateTitle(title) {
  return title.length > 72 ? title.slice(0, 71).trimEnd() + '…' : title;
}

function clockTime(value) {
  const d = new Date(value);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
