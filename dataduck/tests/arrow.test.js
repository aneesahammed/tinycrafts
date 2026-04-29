import { describe, expect, it } from 'vitest';
import { arrowTableToObjects } from '../src/util/arrow.js';

describe('Arrow result conversion', () => {
  it('preserves result column type metadata alongside row values', () => {
    const table = {
      schema: {
        fields: [
          { name: 'order_date', type: { toString: () => 'Date32<DAY>' } },
          { name: 'total_amount', type: { toString: () => 'Float64' } },
        ],
      },
      toArray: () => [
        {
          toJSON: () => ({
            order_date: 1735776000000,
            total_amount: 11567.59,
          }),
        },
      ],
    };

    expect(arrowTableToObjects(table)).toEqual({
      columns: ['order_date', 'total_amount'],
      columnTypes: {
        order_date: 'Date32<DAY>',
        total_amount: 'Float64',
      },
      rows: [
        {
          order_date: 1735776000000,
          total_amount: 11567.59,
        },
      ],
    });
  });

  it('infers epoch-millisecond display metadata for numeric date-like result columns', () => {
    const table = {
      schema: {
        fields: [
          { name: 'order_date', type: { toString: () => 'Int64' } },
          { name: 'total_amount_sum', type: { toString: () => 'Float64' } },
        ],
      },
      toArray: () => [
        { toJSON: () => ({ order_date: 1735776000000, total_amount_sum: 11567.59 }) },
        { toJSON: () => ({ order_date: 1766707200000, total_amount_sum: 2822.49 }) },
      ],
    };

    expect(arrowTableToObjects(table).columnTypes).toEqual({
      order_date: 'Date64<MILLISECOND>',
      total_amount_sum: 'Float64',
    });
  });
});
