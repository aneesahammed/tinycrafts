import { describe, expect, it, vi } from 'vitest';
import { buildHistogramBars, mountProfiler } from '../src/ui/profiler.js';

function createStore(state) {
  const listeners = [];
  return {
    state,
    subscribe: vi.fn((listener) => {
      listeners.push(listener);
    }),
    emit(nextState) {
      Object.assign(state, nextState);
      listeners.forEach((listener) => listener(state));
    },
  };
}

describe('column profiler drawer', () => {
  it('normalizes sparse histogram buckets for a stable tiny chart', () => {
    expect(
      buildHistogramBars(
        [
          { bucket: 0, count: 2 },
          { bucket: 2, count: 6 },
        ],
        4,
      ),
    ).toEqual([
      { bucket: 0, count: 2, ratio: 1 / 3 },
      { bucket: 1, count: 0, ratio: 0 },
      { bucket: 2, count: 6, ratio: 1 },
      { bucket: 3, count: 0, ratio: 0 },
    ]);
  });

  it('loads a profile, renders an SVG histogram, and keeps query actions local to the drawer', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}]]),
    });
    const setSql = vi.fn();
    const loadProfile = vi.fn(async () => ({
      table: 'lab',
      column: 'amount',
      type: 'DOUBLE',
      kind: 'histogram',
      stats: { rowCount: 100, nulls: 5, distinct: 24, min: 0, max: 100 },
      bins: [
        { bucket: 0, count: 10 },
        { bucket: 1, count: 20 },
        { bucket: 2, count: 5 },
      ],
    }));

    const profiler = mountProfiler(work, store, { loadProfile, setSql });
    await profiler.open({
      table: 'lab',
      column: 'amount',
      type: 'DOUBLE',
      stats: { rowCount: 100 },
      totalRows: 100,
    });

    expect(loadProfile).toHaveBeenCalledWith({
      table: 'lab',
      column: 'amount',
      type: 'DOUBLE',
      stats: { rowCount: 100 },
      totalRows: 100,
    });
    expect(work.querySelector('.profile-drawer').hidden).toBe(false);
    expect(work.querySelector('.profile-title').textContent).toContain('amount');
    expect(work.querySelector('svg.profile-chart')).not.toBeNull();

    work.querySelector('[data-profile-action="query"]').click();
    expect(setSql).toHaveBeenCalledWith('SELECT "amount"\nFROM "lab"\nLIMIT 500;');
  });

  it('guards raw decimal null percentages when rendering stats', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}]]),
    });
    const loadProfile = vi.fn(async () => ({
      table: 'lab',
      column: 'amount',
      type: 'DOUBLE',
      kind: 'histogram',
      stats: { rowCount: 2, nullPercentage: 5000, distinct: 1, min: 0, max: 1 },
      bins: [{ bucket: 0, count: 1 }],
    }));

    const profiler = mountProfiler(work, store, { loadProfile, setSql: vi.fn() });
    await profiler.open({ table: 'lab', column: 'amount', type: 'DOUBLE' });

    expect([...work.querySelectorAll('.profile-stat b')].map((node) => node.textContent)).toContain('50%');
  });

  it('renders an empty state instead of fake bars for empty histograms', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}]]),
    });
    const loadProfile = vi.fn(async () => ({
      table: 'lab',
      column: 'amount',
      type: 'DOUBLE',
      kind: 'histogram',
      stats: { rowCount: 0, distinct: 0 },
      bins: [],
    }));

    const profiler = mountProfiler(work, store, { loadProfile, setSql: vi.fn() });
    await profiler.open({ table: 'lab', column: 'amount', type: 'DOUBLE' });

    expect(work.querySelector('svg.profile-chart')).toBeNull();
    expect(work.querySelector('.profile-empty').textContent).toContain('No non-null values found.');
  });

  it('renders top values with pluralized counts and categorical stats', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}]]),
    });
    const setSql = vi.fn();
    const loadProfile = vi.fn(async () => ({
      table: 'lab',
      column: 'status',
      type: 'VARCHAR',
      kind: 'values',
      stats: { rowCount: 3, nullPercentage: 0, distinct: 1, min: 'Original', max: 'Original' },
      values: [{ value: 'Original', count: 3 }],
    }));

    const profiler = mountProfiler(work, store, { loadProfile, setSql });
    await profiler.open({ table: 'lab', column: 'status', type: 'VARCHAR' });

    expect(work.querySelector('.profile-chart-head b').textContent).toBe('1 value');
    expect([...work.querySelectorAll('.profile-stat span')].map((node) => node.textContent)).not.toContain('Range');

    work.querySelector('[data-profile-action="group"]').click();
    expect(setSql).toHaveBeenCalledWith(
      'SELECT "status", COUNT(*) AS row_count\nFROM "lab"\nGROUP BY 1\nORDER BY row_count DESC\nLIMIT 100;',
    );

    work.querySelector('[data-profile-action="filter"]').click();
    expect(setSql).toHaveBeenCalledWith('SELECT *\nFROM "lab"\nWHERE "status" IS NOT NULL\nLIMIT 500;');
  });

  it('uses the same empty top-values language in header and body', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}]]),
    });
    const loadProfile = vi.fn(async () => ({
      table: 'lab',
      column: 'status',
      type: 'VARCHAR',
      kind: 'values',
      stats: { rowCount: 0, distinct: 0 },
      values: [],
    }));

    const profiler = mountProfiler(work, store, { loadProfile, setSql: vi.fn() });
    await profiler.open({ table: 'lab', column: 'status', type: 'VARCHAR' });

    expect(work.querySelector('.profile-chart-head b').textContent).toBe('No non-null values');
    expect(work.querySelector('.profile-empty').textContent).toContain('No non-null values found.');
  });

  it('closes from the close button and when the active table changes', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}], ['other', {}]]),
    });
    const loadProfile = vi.fn(async () => ({
      table: 'lab',
      column: 'status',
      type: 'VARCHAR',
      kind: 'values',
      stats: { rowCount: 1 },
      values: [{ value: 'A', count: 1 }],
    }));

    const profiler = mountProfiler(work, store, { loadProfile, setSql: vi.fn() });
    await profiler.open({ table: 'lab', column: 'status', type: 'VARCHAR' });
    work.querySelector('[data-profile-action="close"]').click();
    expect(work.querySelector('.profile-drawer').hidden).toBe(true);

    await profiler.open({ table: 'lab', column: 'status', type: 'VARCHAR' });
    store.emit({ activeTable: 'other' });
    expect(work.querySelector('.profile-drawer').hidden).toBe(true);
  });

  it('renders load errors and ignores stale profile requests', async () => {
    const work = document.createElement('main');
    const store = createStore({
      activeTable: 'lab',
      files: new Map([['lab', {}]]),
    });
    const setSql = vi.fn();
    let resolveFirst;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const loadProfile = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        table: 'lab',
        column: 'second',
        type: 'VARCHAR',
        kind: 'values',
        stats: { rowCount: 1 },
        values: [{ value: 'B', count: 1 }],
      })
      .mockRejectedValueOnce(new Error('profile failed'));

    const profiler = mountProfiler(work, store, { loadProfile, setSql });
    const staleOpen = profiler.open({ table: 'lab', column: 'first', type: 'VARCHAR' });
    await profiler.open({ table: 'lab', column: 'second', type: 'VARCHAR' });
    resolveFirst({
      table: 'lab',
      column: 'first',
      type: 'VARCHAR',
      kind: 'values',
      stats: { rowCount: 1 },
      values: [{ value: 'A', count: 1 }],
    });
    await staleOpen;
    expect(work.querySelector('.profile-title').textContent).toContain('second');

    await profiler.open({ table: 'lab', column: 'broken', type: 'VARCHAR' });
    expect(work.querySelector('.profile-error').textContent).toContain('profile failed');
  });
});
