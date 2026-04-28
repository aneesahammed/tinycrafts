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

  it('renders CSV format metadata and row counts without parquet-only fields', () => {
    const rail = document.createElement('aside');
    const store = createStore({
      activeTable: 'sales',
      files: new Map([
        [
          'sales',
          {
            format: 'csv',
            profile: {
              rowCount: 17,
              schema: [{ column_name: 'name', column_type: 'VARCHAR' }],
              codecs: [{ compression: 'SNAPPY' }],
              rowGroups: [{ row_group_id: 0 }],
              fileMeta: { created_by: 'parquet-writer' },
            },
            summary: new Map([['name', { rowCount: 17, distinct: 3 }]]),
          },
        ],
      ]),
    });

    mountRail(rail, store, {
      onPickFiles: vi.fn(),
      onClose: vi.fn(),
      onSwitch: vi.fn(),
      onColClick: vi.fn(),
    });
    store.emit();

    expect(rail.querySelector('.file .rows').textContent).toBe('17');
    expect(rail.textContent).toContain('Format');
    expect(rail.textContent).toContain('CSV');
    expect(rail.textContent).not.toContain('Compression');
    expect(rail.textContent).not.toContain('Row groups');
    expect(rail.textContent).not.toContain('Created by');
  });

  it('offers an explicit summary action when CSV stats were deferred', () => {
    const rail = document.createElement('aside');
    const onSummarize = vi.fn();
    const store = createStore({
      activeTable: 'large',
      files: new Map([
        [
          'large',
          {
            format: 'csv',
            summaryStatus: 'deferred',
            profile: {
              schema: [{ column_name: 'id', column_type: 'BIGINT' }],
            },
            summary: new Map(),
          },
        ],
      ]),
    });

    mountRail(rail, store, {
      onPickFiles: vi.fn(),
      onClose: vi.fn(),
      onSwitch: vi.fn(),
      onColClick: vi.fn(),
      onSummarize,
    });
    store.emit();

    const button = rail.querySelector('#rSummarize');
    expect(button?.textContent).toBe('Summarize now');
    button.click();
    expect(onSummarize).toHaveBeenCalledWith('large');
  });
});
