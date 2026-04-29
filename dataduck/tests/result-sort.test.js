import { describe, expect, it } from 'vitest';
import { createStore } from '../src/state/store.js';
import { mountResult } from '../src/ui/result.js';

function visibleValues(host) {
  return [...host.querySelectorAll('tbody tr')].map((row) => row.children[1]?.textContent);
}

describe('result table sorting', () => {
  it('keeps null values last in both ascending and descending sort order', () => {
    const store = createStore();
    const host = document.createElement('main');
    mountResult(host, store);

    store.setResult({
      columns: ['amount'],
      columnTypes: { amount: 'DOUBLE' },
      rows: [{ amount: null }, { amount: 2 }, { amount: 1 }],
      elapsedMs: 1,
    });

    host.querySelector('th[data-sortable]').click();
    expect(visibleValues(host)).toEqual(['1', '2', 'NULL']);

    host.querySelector('th[data-sortable]').click();
    expect(visibleValues(host)).toEqual(['2', '1', 'NULL']);
  });
});
