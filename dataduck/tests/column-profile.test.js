import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/duckdb/engine.js';
import {
  buildHistogramSql,
  profileColumn,
  profileKindForType,
} from '../src/duckdb/column-profile.js';

vi.mock('../src/duckdb/engine.js', () => ({
  query: vi.fn(),
}));

describe('column profile engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes DuckDB unsigned integers and timezone timestamps to histograms', () => {
    expect(profileKindForType('UINTEGER')).toBe('histogram');
    expect(profileKindForType('TIMESTAMPTZ')).toBe('histogram');
    expect(profileKindForType('TIMESTAMP WITH TIME ZONE')).toBe('histogram');
    expect(profileKindForType('VARCHAR')).toBe('values');
  });

  it('can sample large histogram scans', () => {
    const sql = buildHistogramSql({
      table: 'events',
      column: 'created_at',
      type: 'TIMESTAMPTZ',
      bucketCount: 4,
      sampleRows: 250_000,
    });

    expect(sql).toContain('FROM "events" USING SAMPLE 250000 ROWS');
    expect(sql).toContain('CAST(epoch_ms("created_at") AS DOUBLE)');
    expect(sql).toContain('LEAST(3,');
  });

  it('falls back to top values when a histogram query fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query
      .mockRejectedValueOnce(new Error('histogram failed'))
      .mockResolvedValueOnce({ rows: [{ value: 'Original', count: 15n }] });

    const profile = await profileColumn({
      table: 'lab',
      column: 'status',
      type: 'DOUBLE',
      stats: { rowCount: 100 },
      totalRows: 100,
    });

    expect(profile.kind).toBe('values');
    expect(profile.values).toEqual([{ value: 'Original', count: 15 }]);
    expect(query).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('hides impossible null stats when profile counts prove them inconsistent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query.mockResolvedValueOnce({ rows: [{ value: 'Original', count: 15_000 }] });

    const profile = await profileColumn({
      table: 'lab',
      column: 'status',
      type: 'VARCHAR',
      stats: {
        rowCount: 10_000,
        nullPercentage: 50,
        nullCount: 5_000,
        nulls: 50,
      },
    });

    expect(profile.stats.nullPercentage).toBeNull();
    expect(profile.stats.nullCount).toBeNull();
    expect(profile.stats.nulls).toBeNull();
    warn.mockRestore();
  });
});
