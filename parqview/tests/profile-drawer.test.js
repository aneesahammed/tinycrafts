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
});
