import { describe, expect, it } from 'vitest';
import { sampleQueries } from '../src/sql/templates.js';

describe('sample query templates', () => {
  it('includes parquet metadata queries only for parquet files', () => {
    expect(sampleQueries('events', 'events.parquet', 'parquet').map((query) => query.label)).toEqual([
      'SELECT *',
      'DESCRIBE',
      'SUMMARIZE',
      'parquet_file_metadata',
      'parquet_metadata',
    ]);

    expect(sampleQueries('sales', 'sales.csv', 'csv').map((query) => query.label)).toEqual([
      'SELECT *',
      'DESCRIBE',
      'SUMMARIZE',
    ]);
  });
});
