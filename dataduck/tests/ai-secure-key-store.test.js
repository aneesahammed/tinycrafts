import { describe, expect, it } from 'vitest';
import { clearGroqKey, loadGroqKey, saveGroqKey, secureKeyStoreSupported } from '../src/ai/secure-key-store.js';

describe('secure key store', () => {
  it('reports unsupported environments and fails closed', async () => {
    const env = {};
    expect(secureKeyStoreSupported(env)).toBe(false);
    await expect(loadGroqKey(env)).rejects.toThrow('IndexedDB and WebCrypto');
  });

  it('saves, loads, rejects tampering, and clears the remembered key', async () => {
    const fakeIdb = createFakeIndexedDb();
    const env = {
      indexedDB: fakeIdb.indexedDB,
      crypto: globalThis.crypto,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
    };

    await saveGroqKey('gsk_secret', env);
    expect(await loadGroqKey(env)).toBe('gsk_secret');

    fakeIdb.tamper('groq-api-key', (row) => ({ ...row, ct: new Uint8Array(row.ct).fill(0) }));
    await expect(loadGroqKey(env)).rejects.toThrow();

    await clearGroqKey(env);
    expect(await loadGroqKey(env)).toBe('');
  });
});

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
