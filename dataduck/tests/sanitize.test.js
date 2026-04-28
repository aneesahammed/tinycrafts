import { describe, expect, it } from 'vitest';
import { sanitizeTableName, uniqueTableName } from '../src/duckdb/sanitize.js';

describe('table-name sanitization', () => {
  it('strips supported file extensions', () => {
    expect(sanitizeTableName('sales.csv')).toBe('sales');
    expect(sanitizeTableName('events.parquet')).toBe('events');
    expect(sanitizeTableName('archive.parq')).toBe('archive');
  });

  it('normalizes unsafe names into SQL-friendly identifiers', () => {
    expect(sanitizeTableName('2026 Sales.csv')).toBe('t_2026_sales');
    expect(sanitizeTableName('weird-name!.csv')).toBe('weird_name');
    expect(sanitizeTableName('!!!.parquet')).toBe('data');
  });

  it('deduplicates colliding table names deterministically', () => {
    expect(uniqueTableName('sales', new Set(['sales', 'sales_1']))).toBe('sales_2');
  });
});
