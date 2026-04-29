import { describe, expect, it } from 'vitest';
import {
  clearProviderKey,
  loadLegacyGroqKey,
  loadProviderKey,
  migrateLegacyGroqKey,
  saveLegacyGroqKey,
  saveProviderKey,
  secureKeyStoreSupported,
} from '../src/ai/secure-key-store.js';

describe('secure key store', () => {
  it('reports unsupported environments and fails closed', async () => {
    const env = {};
    expect(secureKeyStoreSupported(env)).toBe(false);
    await expect(loadProviderKey('groq', env)).rejects.toThrow('IndexedDB and WebCrypto');
  });

  it('saves, loads, rejects tampering, and clears provider-scoped remembered keys', async () => {
    const fakeIdb = createFakeIndexedDb();
    const env = {
      indexedDB: fakeIdb.indexedDB,
      crypto: globalThis.crypto,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
    };

    await saveProviderKey('groq', 'gsk_secret', env);
    expect(await loadProviderKey('groq', env)).toBe('gsk_secret');

    fakeIdb.tamper('provider:groq:apiKey', (row) => ({ ...row, ct: new Uint8Array(row.ct).fill(0) }));
    await expect(loadProviderKey('groq', env)).rejects.toThrow();

    await clearProviderKey('groq', env);
    expect(await loadProviderKey('groq', env)).toBe('');
  });

  it('migrates the legacy Groq key only after provider-key verification', async () => {
    const fakeIdb = createFakeIndexedDb();
    const env = createFakeEnv(fakeIdb);

    await saveLegacyGroqKey('gsk_legacy', env);

    await expect(migrateLegacyGroqKey(env)).resolves.toMatchObject({ status: 'migrated' });
    expect(await loadProviderKey('groq', env)).toBe('gsk_legacy');
    expect(await loadLegacyGroqKey(env)).toBe('');

    await expect(migrateLegacyGroqKey(env)).resolves.toMatchObject({ status: 'skipped' });
  });

  it('keeps the provider key canonical and cleans legacy data when a migrated provider key already exists', async () => {
    const fakeIdb = createFakeIndexedDb();
    const env = createFakeEnv(fakeIdb);

    await saveLegacyGroqKey('gsk_legacy', env);
    await saveProviderKey('groq', 'gsk_new', env);
    await expect(migrateLegacyGroqKey(env)).resolves.toMatchObject({ status: 'skipped' });
    expect(await loadProviderKey('groq', env)).toBe('gsk_new');
    expect(await loadLegacyGroqKey(env)).toBe('');
  });

  it('cleans unrecoverable legacy data after migration failure to avoid repeated failure loops', async () => {
    const fakeIdb = createFakeIndexedDb();
    const env = createFakeEnv(fakeIdb);

    await saveLegacyGroqKey('gsk_legacy', env);
    fakeIdb.tamper('groq-api-key', (row) => ({ ...row, ct: new Uint8Array(row.ct).fill(0) }));
    await expect(migrateLegacyGroqKey(env)).resolves.toMatchObject({ status: 'failed' });
    expect(fakeIdb.has('groq-api-key')).toBe(false);
    expect(await loadProviderKey('groq', env)).toBe('');
  });

  it('does not delete a provider key written by another tab while migration is failing', async () => {
    const fakeIdb = createFakeIndexedDb();
    const env = createFakeEnv(fakeIdb);

    await saveLegacyGroqKey('gsk_legacy', env);
    fakeIdb.tamper('groq-api-key', (row) => ({ ...row, ct: new Uint8Array(row.ct).fill(0) }));
    env.crypto = cryptoWithDecryptSideEffect(() => {
      fakeIdb.putRaw({ id: 'provider:groq:apiKey', iv: new Uint8Array([1]), ct: new Uint8Array([2]) });
    });

    await expect(migrateLegacyGroqKey(env)).resolves.toMatchObject({ status: 'failed' });

    expect(fakeIdb.has('provider:groq:apiKey')).toBe(true);
    expect(fakeIdb.has('groq-api-key')).toBe(false);
  });
});

function createFakeEnv(fakeIdb) {
  return {
    indexedDB: fakeIdb.indexedDB,
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
  };
}

function createFakeIndexedDb() {
  const rows = new Map();
  const store = {
    get(id) {
      return request(() => rows.get(id) || null);
    },
    put(value) {
      return request(() => rows.set(value.id, value));
    },
    delete(id) {
      return request(() => rows.delete(id));
    },
  };
  const indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => store,
          transaction: () => {
            const tx = {
              objectStore: () => store,
              oncomplete: null,
              onerror: null,
            };
            queueMicrotask(() => tx.oncomplete?.());
            return tx;
          },
          close: () => {},
        };
        req.onsuccess?.();
      });
      return req;
    },
  };
  return {
    indexedDB,
    tamper(id, fn) {
      rows.set(id, fn(rows.get(id)));
    },
    has(id) {
      return rows.has(id);
    },
    putRaw(row) {
      rows.set(row.id, row);
    },
  };
}

function cryptoWithDecryptSideEffect(onDecryptFailure) {
  return {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    subtle: {
      generateKey: (...args) => globalThis.crypto.subtle.generateKey(...args),
      encrypt: (...args) => globalThis.crypto.subtle.encrypt(...args),
      decrypt: async (...args) => {
        try {
          return await globalThis.crypto.subtle.decrypt(...args);
        } catch (error) {
          onDecryptFailure();
          throw error;
        }
      },
    },
  };
}

function request(fn) {
  const req = {};
  queueMicrotask(() => {
    try {
      req.result = fn();
      req.onsuccess?.();
    } catch (error) {
      req.error = error;
      req.onerror?.();
    }
  });
  return req;
}
