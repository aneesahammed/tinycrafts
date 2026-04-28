const DB_NAME = 'dataduck-ai-secrets';
const DB_VERSION = 1;
const STORE = 'secrets';
const KEY_ID = 'aes-key';
const GROQ_KEY_ID = 'groq-api-key';

export function secureKeyStoreSupported(env = globalThis) {
  return Boolean(
    env.indexedDB &&
      env.crypto?.subtle &&
      env.crypto?.getRandomValues &&
      env.TextEncoder &&
      env.TextDecoder,
  );
}

export async function saveGroqKey(plaintext, env = globalThis) {
  assertSupported(env);
  if (!plaintext) {
    await idbDelete(GROQ_KEY_ID, env);
    return;
  }
  const payload = await encryptString(String(plaintext), env);
  await idbPut({ id: GROQ_KEY_ID, iv: payload.iv, ct: payload.ct }, env);
}

export async function loadGroqKey(env = globalThis) {
  assertSupported(env);
  const row = await idbGet(GROQ_KEY_ID, env);
  if (!row?.iv || !row?.ct) return '';
  return decryptPayload({ iv: row.iv, ct: row.ct }, env);
}

export async function clearGroqKey(env = globalThis) {
  assertSupported(env);
  await idbDelete(GROQ_KEY_ID, env);
}

async function getOrCreateAesKey(env) {
  const existing = await idbGet(KEY_ID, env);
  if (existing?.key) return existing.key;
  const key = await env.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await idbPut({ id: KEY_ID, key }, env);
  return key;
}

async function encryptString(plaintext, env) {
  const key = await getOrCreateAesKey(env);
  const iv = env.crypto.getRandomValues(new Uint8Array(12));
  const bytes = new env.TextEncoder().encode(plaintext);
  const cipher = await env.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv, ct: new Uint8Array(cipher) };
}

async function decryptPayload(payload, env) {
  const key = await getOrCreateAesKey(env);
  const plain = await env.crypto.subtle.decrypt({ name: 'AES-GCM', iv: payload.iv }, key, payload.ct);
  return new env.TextDecoder().decode(plain);
}

function openDb(env) {
  return new Promise((resolve, reject) => {
    const req = env.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(id, env) {
  const db = await openDb(env);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbPut(value, env) {
  const db = await openDb(env);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function idbDelete(id, env) {
  const db = await openDb(env);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function assertSupported(env) {
  if (!secureKeyStoreSupported(env)) {
    throw new Error('Secure key storage requires IndexedDB and WebCrypto.');
  }
}
