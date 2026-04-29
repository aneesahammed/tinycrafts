const DB_NAME = 'dataduck-ai-secrets';
const DB_VERSION = 1;
const STORE = 'secrets';
const KEY_ID = 'aes-key';
const GROQ_KEY_ID = 'groq-api-key';
const PROVIDER_KEY_PREFIX = 'provider:';

// Browser-local persistence only. The AES key lives in the same origin store, so this
// avoids localStorage/plaintext exposure but is not an XSS or compromised-origin boundary.
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
  return saveProviderKey('groq', plaintext, env);
}

export async function loadGroqKey(env = globalThis) {
  return loadProviderKey('groq', env);
}

export async function clearGroqKey(env = globalThis) {
  return clearProviderKey('groq', env);
}

export async function saveLegacyGroqKey(plaintext, env = globalThis) {
  assertSupported(env);
  if (!plaintext) {
    await idbDelete(GROQ_KEY_ID, env);
    return;
  }
  const payload = await encryptString(String(plaintext), env);
  await idbPut({ id: GROQ_KEY_ID, iv: payload.iv, ct: payload.ct }, env);
}

export async function loadLegacyGroqKey(env = globalThis) {
  assertSupported(env);
  const row = await idbGet(GROQ_KEY_ID, env);
  if (!row?.iv || !row?.ct) return '';
  return decryptPayload({ iv: row.iv, ct: row.ct }, env);
}

export async function clearLegacyGroqKey(env = globalThis) {
  assertSupported(env);
  await idbDelete(GROQ_KEY_ID, env);
}

export async function saveProviderKey(providerId, plaintext, env = globalThis) {
  assertSupported(env);
  const id = providerKeyId(providerId);
  if (!plaintext) {
    await idbDelete(id, env);
    return;
  }
  const payload = await encryptString(String(plaintext), env);
  await idbPut({ id, iv: payload.iv, ct: payload.ct }, env);
}

export async function loadProviderKey(providerId, env = globalThis) {
  assertSupported(env);
  const row = await idbGet(providerKeyId(providerId), env);
  if (!row?.iv || !row?.ct) return '';
  return decryptPayload({ iv: row.iv, ct: row.ct }, env);
}

export async function clearProviderKey(providerId, env = globalThis) {
  assertSupported(env);
  await idbDelete(providerKeyId(providerId), env);
}

export async function migrateLegacyGroqKey(env = globalThis) {
  assertSupported(env);
  const newId = providerKeyId('groq');
  const existing = await idbGet(newId, env);
  if (existing?.iv && existing?.ct) {
    await idbDelete(GROQ_KEY_ID, env).catch(() => undefined);
    return { status: 'skipped' };
  }
  const legacy = await idbGet(GROQ_KEY_ID, env);
  if (!legacy?.iv || !legacy?.ct) return { status: 'none' };

  let migratedRow = null;
  let decrypted = false;
  try {
    const plaintext = await decryptPayload({ iv: legacy.iv, ct: legacy.ct }, env);
    decrypted = true;
    if (!plaintext) {
      await idbDelete(GROQ_KEY_ID, env).catch(() => undefined);
      return { status: 'none' };
    }
    const payload = await encryptString(plaintext, env);
    migratedRow = { id: newId, iv: payload.iv, ct: payload.ct };
    await idbPut(migratedRow, env);
    const verified = await loadProviderKey('groq', env);
    if (verified !== plaintext) throw new Error('Provider key verification failed.');
    await idbDelete(GROQ_KEY_ID, env);
    return { status: 'migrated' };
  } catch (error) {
    if (migratedRow) {
      const current = await idbGet(newId, env).catch(() => null);
      if (encryptedRowsMatch(current, migratedRow)) await idbDelete(newId, env).catch(() => undefined);
    }
    if (!decrypted) await idbDelete(GROQ_KEY_ID, env).catch(() => undefined);
    return { status: 'failed', error };
  }
}

function providerKeyId(providerId) {
  const id = String(providerId || '').trim();
  if (!id) throw new Error('Provider id is required.');
  return `${PROVIDER_KEY_PREFIX}${id}:apiKey`;
}

function encryptedRowsMatch(a, b) {
  return Boolean(
    a &&
      b &&
      a.id === b.id &&
      bytesEqual(a.iv, b.iv) &&
      bytesEqual(a.ct, b.ct),
  );
}

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
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
