import { normalizeAnalysisForRender, persistableAnalysis } from './analysis-engine/artifacts.js';

const DB_NAME = 'dataduck-ai-threads';
const DB_VERSION = 2;
const STORE = 'threads';
const MAX_THREADS = 25;

let memoryThreads = [];

export function createThread({ title = 'New analysis', datasetFingerprint = null, tableLabel = null, now = () => Date.now(), randomUUID = () => crypto?.randomUUID?.() } = {}) {
  const createdAt = now();
  return {
    id: randomUUID?.() || `thread_${createdAt}_${Math.random().toString(16).slice(2)}`,
    title,
    datasetFingerprint,
    tableLabel,
    schemaVersion: 2,
    messages: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export async function listThreads() {
  const rows = await readThreads();
  return sortThreads(rows);
}

export async function saveThread(thread) {
  if (!thread?.id) throw new Error('Thread id is required.');
  const sanitized = sanitizeThread(thread);
  const next = pruneThreads([...(await readThreads()).filter((item) => item.id !== sanitized.id), sanitized]);
  await writeThreads(next);
  return sanitized;
}

export async function deleteThread(id) {
  const next = (await readThreads()).filter((item) => item.id !== id);
  await writeThreads(next);
  return sortThreads(next);
}

export function threadIsHistorical(thread, currentFingerprint) {
  return Boolean(thread?.datasetFingerprint && currentFingerprint && thread.datasetFingerprint !== currentFingerprint);
}

function sanitizeThread(thread) {
  const messages = Array.isArray(thread.messages) ? thread.messages.map(sanitizeMessage).filter(Boolean) : [];
  const title = String(thread.title || messages.find((m) => m.role === 'user')?.text || 'New analysis').slice(0, 100);
  return {
    id: String(thread.id),
    schemaVersion: 2,
    title,
    datasetFingerprint: thread.datasetFingerprint || null,
    tableLabel: thread.tableLabel || null,
    messages,
    createdAt: normalizeTime(thread.createdAt),
    updatedAt: normalizeTime(thread.updatedAt || Date.now()),
  };
}

function sanitizeMessage(message) {
  if (!message || (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system')) return null;
  return {
    id: String(message.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`),
    role: message.role,
    text: String(message.text || ''),
    analysis: sanitizeAnalysis(message.analysis),
    createdAt: normalizeTime(message.createdAt),
  };
}

function sanitizeAnalysis(analysis) {
  if (!analysis) return null;
  const normalized = normalizeAnalysisForRender(analysis);
  return persistableAnalysis(normalized);
}

function sortThreads(threads) {
  return [...threads].sort((a, b) => normalizeTime(b.updatedAt) - normalizeTime(a.updatedAt));
}

function pruneThreads(threads) {
  return sortThreads(threads).slice(0, MAX_THREADS);
}

function normalizeTime(value) {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? time : Date.now();
}

async function readThreads() {
  if (!hasIndexedDb()) return memoryThreads;
  try {
    return await withDb('readonly', (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []).map(sanitizeThread));
        req.onerror = () => reject(req.error);
      }),
    );
  } catch {
    return memoryThreads;
  }
}

async function writeThreads(threads) {
  memoryThreads = pruneThreads(threads);
  if (!hasIndexedDb()) return;
  await withDb('readwrite', (store) =>
    new Promise((resolve, reject) => {
      const clear = store.clear();
      clear.onerror = () => reject(clear.error);
      clear.onsuccess = () => {
        if (!memoryThreads.length) {
          resolve();
          return;
        }
        let pending = memoryThreads.length;
        for (const thread of memoryThreads) {
          const req = store.put(thread);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            pending -= 1;
            if (pending === 0) resolve();
          };
        }
      };
    }),
  ).catch(() => undefined);
}

function withDb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
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

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined' && indexedDB?.open;
}
