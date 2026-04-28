import { describe, expect, it } from 'vitest';
import { buildAggregateSummaryRequest, sanitizeAggregatePayload } from '../src/ai/aggregate-upload.js';

describe('aggregate upload sanitizer', () => {
  it('caps rows, columns, cell width, and total payload size', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      a: `row-${i}`,
      b: 'x'.repeat(20),
      c: 'hidden',
    }));

    const payload = sanitizeAggregatePayload(
      { columns: ['a', 'b', 'c'], rows },
      { maxRows: 2, maxColumns: 2, maxCellChars: 5, maxPayloadChars: 100 },
    );

    expect(payload.columns).toEqual(['a', 'b']);
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0].b).toBe('xxxxx...');
    expect(payload.truncated).toBe(true);
  });

  it('caps the exact serialized aggregate summary request', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      product: `product-${index}`,
      revenue: '9'.repeat(80),
    }));
    const request = buildAggregateSummaryRequest({
      question: 'q'.repeat(500),
      title: 'Revenue summary',
      columns: ['product', 'revenue'],
      rows,
    }, { maxRows: 50, maxColumns: 12, maxCellChars: 512, maxPayloadChars: 900 });

    expect(JSON.stringify(request).length).toBeLessThanOrEqual(900);
    expect(request.aggregatePayload.truncated).toBe(true);
  });
});
