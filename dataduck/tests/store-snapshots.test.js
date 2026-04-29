import { describe, expect, it } from 'vitest';
import { createStore } from '../src/state/store.js';

const a = { id: 'a', sql: 'SELECT 1', title: 'SELECT 1', ranAt: 1, pinned: false };
const b = { id: 'b', sql: 'SELECT 2', title: 'SELECT 2', ranAt: 2, pinned: false };

describe('store query snapshot state', () => {
  it('sets, adds, updates, and removes query snapshots', () => {
    const store = createStore();
    const states = [];
    store.subscribe((state) => states.push([...state.querySnapshots]));

    store.setQuerySnapshots([a]);
    store.addQuerySnapshot(b);
    store.updateQuerySnapshot('a', { pinned: true, pinnedAt: 3 });
    store.removeQuerySnapshot('b');

    expect(store.state.querySnapshots).toEqual([{ ...a, pinned: true, pinnedAt: 3 }]);
    expect(states).toHaveLength(4);
  });

  it('tracks one active right panel at a time without persisting panel state', () => {
    const store = createStore();

    store.setRightPanel({ type: 'profile', payload: { column: 'amount' } });
    expect(store.state.rightPanel).toMatchObject({ type: 'profile' });

    store.setRightPanel({ type: 'snapshots' });
    expect(store.state.rightPanel).toEqual({ type: 'snapshots' });

    store.setRightPanel(null);
    expect(store.state.rightPanel).toBeNull();
  });

  it('tracks whether the left rail is collapsed', () => {
    const store = createStore();
    const states = [];
    store.subscribe((state) => states.push(state.railCollapsed));

    expect(store.state.railCollapsed).toBe(false);

    store.setRailCollapsed(true);
    expect(store.state.railCollapsed).toBe(true);

    store.setRailCollapsed(false);
    expect(store.state.railCollapsed).toBe(false);
    expect(states).toEqual([true, false]);
  });

  it('stores query result column types for typed display surfaces', () => {
    const store = createStore();

    store.setResult({
      columns: ['order_date'],
      columnTypes: { order_date: 'Date64<MILLISECOND>' },
      rows: [{ order_date: 1735776000000 }],
      elapsedMs: 7,
    });

    expect(store.state.resultColumnTypes).toEqual({ order_date: 'Date64<MILLISECOND>' });

    store.clearResult();

    expect(store.state.resultColumnTypes).toEqual({});
  });

  it('patches file records without replacing the full files map', () => {
    const store = createStore();
    const states = [];
    store.subscribe((state) => states.push(state.files.get('sales')));

    store.addFile('sales', { format: 'csv', summaryStatus: 'deferred' });
    store.updateFile('sales', { summaryStatus: 'ready', summary: new Map() });

    expect(store.state.files.get('sales')).toMatchObject({
      format: 'csv',
      summaryStatus: 'ready',
      summary: expect.any(Map),
    });
    expect(states).toHaveLength(2);
  });
});
