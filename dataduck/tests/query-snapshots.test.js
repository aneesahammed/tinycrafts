import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DB_NAME,
  MAX_PINNED_SNAPSHOTS,
  MAX_UNPINNED_SNAPSHOTS,
  SQL_MAX_CHARS,
  clearQuerySnapshots,
  createQuerySnapshot,
  deriveSnapshotTitle,
  getQuerySnapshotStorageStatus,
  listQuerySnapshots,
  recordQuerySnapshot,
  replaceQuerySnapshots,
  seedSnapshotClock,
  setQuerySnapshotPinned,
  sortQuerySnapshots,
} from '../src/state/query-snapshots.js';

function baseSnapshot(overrides = {}) {
  return {
    id: overrides.id || `snap-${Math.random()}`,
    sql: overrides.sql || 'SELECT * FROM lab;',
    title: overrides.title || 'SELECT * FROM lab',
    activeTable: overrides.activeTable ?? 'lab',
    rowCount: overrides.rowCount ?? 10,
    elapsedMs: overrides.elapsedMs ?? 12,
    columns: overrides.columns || ['a'],
    ranAt: overrides.ranAt ?? 1_700_000_000_000,
    pinned: overrides.pinned ?? false,
    pinnedAt: overrides.pinnedAt ?? null,
  };
}

describe('query snapshot model', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await clearQuerySnapshots();
    seedSnapshotClock([]);
  });

  it('derives stable titles from meaningful SQL', () => {
    const at = new Date('2026-04-27T08:09:10').getTime();
    expect(deriveSnapshotTitle('  ;\n-- previous idea\nSELECT * FROM lab LIMIT 5;', at)).toBe(
      'SELECT * FROM lab LIMIT 5',
    );
    expect(deriveSnapshotTitle('\nWITH x AS (SELECT 1)\nSELECT * FROM x', at)).toBe('WITH query');
    expect(deriveSnapshotTitle('   ; \n -- only comment', at)).toBe('Query at 08:09:10');
    expect(deriveSnapshotTitle('SELECT 1; SELECT 2;', at)).toBe('SELECT 1');
    expect(deriveSnapshotTitle(`SELECT ${'x'.repeat(120)} FROM lab`, at)).toHaveLength(72);
  });

  it('creates metadata-only snapshots with monotonic ids and timestamps', () => {
    const uuid = vi.fn(() => 'uuid-1');
    const first = createQuerySnapshot({
      sql: 'SELECT * FROM lab;',
      activeTable: 'lab',
      rowCount: 2,
      elapsedMs: 3,
      columns: ['a', 'b'],
      now: () => 100,
      randomUUID: uuid,
    });
    const second = createQuerySnapshot({
      sql: 'SELECT * FROM lab;',
      activeTable: 'lab',
      rowCount: 2,
      elapsedMs: 3,
      columns: ['a'],
      now: () => 100,
      randomUUID: () => null,
    });

    expect(first).toMatchObject({
      id: 'uuid-1',
      sql: 'SELECT * FROM lab;',
      title: 'SELECT * FROM lab',
      activeTable: 'lab',
      rowCount: 2,
      elapsedMs: 3,
      columns: ['a', 'b'],
      ranAt: 100,
      pinned: false,
      pinnedAt: null,
    });
    expect(second.ranAt).toBe(101);
    expect(second.id).toMatch(/^qs_101_/);
    expect(second.rows).toBeUndefined();
  });

  it('does not create snapshots for empty or oversized SQL', () => {
    expect(createQuerySnapshot({ sql: ' ', columns: [] })).toBeNull();
    expect(createQuerySnapshot({ sql: 'x'.repeat(SQL_MAX_CHARS + 1), columns: [] })).toBeNull();
  });

  it('sorts pinned snapshots first and keeps recent unpinned order stable', () => {
    const sorted = sortQuerySnapshots([
      baseSnapshot({ id: 'old', ranAt: 10 }),
      baseSnapshot({ id: 'p1', pinned: true, pinnedAt: 20, ranAt: 20 }),
      baseSnapshot({ id: 'new', ranAt: 30 }),
      baseSnapshot({ id: 'p2', pinned: true, pinnedAt: 40, ranAt: 15 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['p2', 'p1', 'new', 'old']);
  });

  it('persists snapshots in a query-specific store and prunes unpinned records', async () => {
    expect(DB_NAME).toBe('dataduck-query-snapshots');

    for (let i = 0; i < MAX_UNPINNED_SNAPSHOTS + 5; i += 1) {
      await recordQuerySnapshot(baseSnapshot({ id: `u${i}`, ranAt: i }));
    }
    await recordQuerySnapshot(baseSnapshot({ id: 'pinned', pinned: true, pinnedAt: 1_000, ranAt: 1 }));

    const snapshots = await listQuerySnapshots();
    expect(snapshots).toHaveLength(MAX_UNPINNED_SNAPSHOTS + 1);
    expect(snapshots[0].id).toBe('pinned');
    expect(snapshots.some((item) => item.id === 'u0')).toBe(false);
  });

  it('refuses new pins when the pinned cap is reached', async () => {
    const snapshots = Array.from({ length: MAX_PINNED_SNAPSHOTS }, (_, i) =>
      baseSnapshot({ id: `p${i}`, pinned: true, pinnedAt: i }),
    );
    snapshots.push(baseSnapshot({ id: 'candidate', pinned: false, ranAt: 2_000 }));
    await replaceQuerySnapshots(snapshots);

    await expect(setQuerySnapshotPinned('candidate', true)).rejects.toMatchObject({
      code: 'PIN_LIMIT',
    });
  });

  it('falls back to session memory when indexedDB is unavailable', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Reflect.deleteProperty(globalThis, 'indexedDB');

    await recordQuerySnapshot(baseSnapshot({ id: 'memory-only' }));

    expect((await listQuerySnapshots()).map((item) => item.id)).toEqual(['memory-only']);
    expect(getQuerySnapshotStorageStatus()).toMatchObject({ mode: 'memory', degraded: true });

    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      writable: true,
      value: originalIndexedDb,
    });
  });

  it('keeps snapshots in session memory when indexedDB writes fail', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    const quotaError = new Error('quota exceeded');
    quotaError.name = 'QuotaExceededError';
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      writable: true,
      value: {
        open: vi.fn(() => {
          const request = {};
          queueMicrotask(() => {
            request.error = quotaError;
            request.onerror?.();
          });
          return request;
        }),
      },
    });

    await recordQuerySnapshot(baseSnapshot({ id: 'quota-fallback' }));

    expect((await listQuerySnapshots()).map((item) => item.id)).toEqual(['quota-fallback']);
    expect(getQuerySnapshotStorageStatus()).toMatchObject({
      mode: 'memory',
      degraded: true,
      reason: 'QuotaExceededError',
    });

    if (originalIndexedDb === undefined) {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    } else {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        writable: true,
        value: originalIndexedDb,
      });
    }
  });
});
