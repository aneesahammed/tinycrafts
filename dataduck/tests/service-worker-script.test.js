import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const swSource = readFileSync('sw.js', 'utf8');

describe('service worker script', () => {
  it('uses a new cache version and bypasses Vite dev-server requests', () => {
    expect(swSource).toContain("const CACHE_NAME = 'dataduck-shell-v3'");
    expect(swSource).toContain('isLocalDevServer(url)');
    expect(swSource).toContain('unregisterLocalDevWorker');
  });
});
