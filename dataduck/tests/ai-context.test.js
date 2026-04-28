import { describe, expect, it } from 'vitest';
import { buildDatasetContext } from '../src/ai/context.js';

describe('AI dataset context', () => {
  it('redacts source rows, result rows, top values, and text min/max', () => {
    const summary = new Map([
      ['name', { rowCount: 2, distinct: 2, nullCount: 0, nullPercentage: 0, min: 'Alice', max: 'Zoe' }],
      ['amount', { rowCount: 2, distinct: 2, nullCount: 0, nullPercentage: 0, min: 10, max: 20 }],
    ]);
    const state = {
      activeTable: 'orders',
      resultRows: [{ secret: 'do-not-send' }],
      files: new Map([
        ['orders', {
          virtualName: 'orders.parquet',
          size: 123,
          format: 'parquet',
          summaryStatus: 'ready',
          summary,
          profile: {
            schema: [
              { column_name: 'name', column_type: 'VARCHAR' },
              { column_name: 'amount', column_type: 'DOUBLE' },
            ],
          },
          topValues: [{ value: 'Alice' }],
        }],
      ]),
    };

    const context = buildDatasetContext(state);

    expect(JSON.stringify(context)).not.toContain('Alice');
    expect(JSON.stringify(context)).not.toContain('do-not-send');
    expect(context.columns.find((column) => column.name === 'name')).not.toHaveProperty('min');
    expect(context.columns.find((column) => column.name === 'amount')).toMatchObject({ min: 10, max: 20 });
  });
});
