import { describe, expect, it } from 'vitest';
import { checkCapabilities } from './capabilities';

describe('checkCapabilities', () => {
  it('reports the browser primitives needed by the worker runtime', () => {
    const result = checkCapabilities();
    if (result.ok) {
      expect(result).toEqual({ ok: true });
    } else {
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing).toEqual([...new Set(result.missing)]);
    }
  });
});
