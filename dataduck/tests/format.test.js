import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/util/csv.js';
import { valueToDisplay } from '../src/util/format.js';

describe('typed value formatting', () => {
  it('formats Arrow date and timestamp epoch values with column type context', () => {
    expect(valueToDisplay(1735776000000, 'Date64<MILLISECOND>')).toBe('2025-01-02');
    expect(valueToDisplay(20090, 'Date32<DAY>')).toBe('2025-01-02');
    expect(valueToDisplay(1763942400000, 'Date32<DAY>')).toBe('2025-11-24');
    expect(valueToDisplay(1735776000000, 'Timestamp<MILLISECOND>')).toBe('2025-01-02T00:00:00.000Z');
  });

  it('uses typed display values when exporting CSV', () => {
    expect(toCsv(
      ['order_date', 'total_amount'],
      [{ order_date: 1735776000000, total_amount: 11567.59 }],
      { order_date: 'Date64<MILLISECOND>' },
    )).toBe('order_date,total_amount\n2025-01-02,11567.59');
  });
});
