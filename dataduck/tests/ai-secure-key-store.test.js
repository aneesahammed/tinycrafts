import { describe, expect, it } from 'vitest';
import { loadGroqKey, secureKeyStoreSupported } from '../src/ai/secure-key-store.js';

describe('secure key store', () => {
  it('reports unsupported environments and fails closed', async () => {
    const env = {};
    expect(secureKeyStoreSupported(env)).toBe(false);
    await expect(loadGroqKey(env)).rejects.toThrow('IndexedDB and WebCrypto');
  });
});
