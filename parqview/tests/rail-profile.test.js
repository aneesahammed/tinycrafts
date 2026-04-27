import { describe, expect, it, vi } from 'vitest';
import { mountRail } from '../src/ui/rail.js';

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

describe('rail column profiling handoff', () => {
  it('passes the selected column with table, type, stats, and row count', () => {
    const rail = document.createElement('aside');
    const summary = new Map([
      [
        'amount',
        {
          distinct: 4,
          nulls: 10,
          rowCount: 100,
          min: 1,
          max: 99,
        },
      ],
    ]);
    const store = createStore({
      activeTable: 'lab',
      files: new Map([
        [
          'lab',
          {
            profile: {
              schema: [{ column_name: 'amount', column_type: 'DOUBLE' }],
              fileMeta: { num_rows: 100 },
            },
            summary,
          },
        ],
      ]),
    });
    const handlers = {
      onPickFiles: vi.fn(),
      onClose: vi.fn(),
      onSwitch: vi.fn(),
      onColClick: vi.fn(),
    };

    mountRail(rail, store, handlers);
    store.emit();
    rail.querySelector('[data-col="amount"]').click();

    expect(handlers.onColClick).toHaveBeenCalledWith({
      table: 'lab',
      column: 'amount',
      type: 'DOUBLE',
      stats: summary.get('amount'),
      totalRows: 100,
    });
  });
});
