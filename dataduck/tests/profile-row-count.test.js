import { describe, expect, it } from 'vitest';
import { rowCountFromSummary } from '../src/duckdb/profile-row-count.js';

describe('profile row-count helpers', () => {
  it('derives row counts from summary maps with bigint values', () => {
    const summary = new Map([
      ['id', { rowCount: 2n }],
      ['name', { rowCount: 5n }],
    ]);

    expect(rowCountFromSummary(summary)).toBe(5);
  });

  it('returns null for empty or invalid summary maps', () => {
    expect(rowCountFromSummary(new Map())).toBeNull();
    expect(rowCountFromSummary(new Map([['id', { rowCount: 'unknown' }]]))).toBeNull();
    expect(rowCountFromSummary(null)).toBeNull();
  });
});
