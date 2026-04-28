import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/duckdb/engine.js';
import { summarizeTable, typeIcon } from '../src/duckdb/summarize.js';

vi.mock('../src/duckdb/engine.js', () => ({
  query: vi.fn(),
}));

describe('SUMMARIZE normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes DuckDB decimal null_percentage values before exposing stats', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          column_name: 'amount',
          column_type: 'INTEGER',
          approx_unique: 1n,
          count: 2n,
          null_percentage: 5000,
          min: '1',
          max: '1',
        },
      ],
    });

    const summary = await summarizeTable('lab');

    expect(query).toHaveBeenCalledWith('SUMMARIZE "lab";');
    expect(summary.get('amount')).toMatchObject({
      type: 'INTEGER',
      distinct: 1,
      nullPercentage: 50,
      nullCount: 1,
      nulls: 50,
      rowCount: 2,
      min: '1',
      max: '1',
    });
  });

  it('recognizes extended numeric and temporal DuckDB type names', () => {
    expect(typeIcon('UINTEGER')).toBe('#');
    expect(typeIcon('TIMESTAMPTZ')).toBe('⏱');
    expect(typeIcon('TIMESTAMP WITH TIME ZONE')).toBe('⏱');
  });
});
