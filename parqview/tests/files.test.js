import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFile, unregisterFile, query, tryQuery } from '../src/duckdb/engine.js';
import { openFileInto } from '../src/duckdb/files.js';
import { createStore } from '../src/state/store.js';

vi.mock('../src/duckdb/engine.js', () => ({
  registerFile: vi.fn(),
  unregisterFile: vi.fn(),
  query: vi.fn(),
  tryQuery: vi.fn(),
}));

vi.mock('../src/state/recents.js', () => ({
  recordRecent: vi.fn(() => Promise.resolve()),
}));

function csvFile(name = 'sales.csv', size = 100) {
  const file = new File(['id,name\n1,Ada\n2,Linus'], name, { type: 'text/csv' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function describeRows() {
  return {
    rows: [
      { column_name: 'id', column_type: 'BIGINT' },
      { column_name: 'name', column_type: 'VARCHAR' },
    ],
  };
}

function summarizeRows() {
  return {
    rows: [
      { column_name: 'id', column_type: 'BIGINT', count: 2, approx_unique: 2, null_percentage: 0 },
      { column_name: 'name', column_type: 'VARCHAR', count: 2, approx_unique: 2, null_percentage: 0 },
    ],
  };
}

describe('opening local files into DuckDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerFile.mockResolvedValue();
    unregisterFile.mockResolvedValue();
    tryQuery.mockResolvedValue({ rows: [] });
  });

  it('opens CSV files through read_csv_auto and binds active aliases', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // create source view
    query.mockResolvedValueOnce(describeRows());
    query.mockResolvedValueOnce(summarizeRows());
    query.mockResolvedValueOnce({ rows: [] }); // active_file alias
    query.mockResolvedValueOnce({ rows: [] }); // parquet_file alias

    const store = createStore();
    const result = await openFileInto(store, csvFile());

    expect(result.tableName).toBe('sales');
    expect(result.warnings).toEqual([]);
    expect(store.state.files.get('sales')).toMatchObject({
      format: 'csv',
      summaryStatus: 'ready',
      profile: { rowCount: 2 },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("read_csv_auto('"));
    expect(query).toHaveBeenCalledWith('CREATE OR REPLACE VIEW active_file AS SELECT * FROM "sales";');
    expect(query).toHaveBeenCalledWith('CREATE OR REPLACE VIEW parquet_file AS SELECT * FROM "sales";');
  });

  it('keeps parquet files on read_parquet with metadata profiling', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce(describeRows());
    tryQuery
      .mockResolvedValueOnce({ rows: [{ num_rows: 2, created_by: 'duckdb' }] })
      .mockResolvedValueOnce({ rows: [{ compression: 'SNAPPY', column_chunks: 2 }] })
      .mockResolvedValueOnce({ rows: [{ row_group_id: 0 }] });
    query.mockResolvedValueOnce(summarizeRows());
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const result = await openFileInto(createStore(), new File(['x'], 'events.parquet'));

    expect(result.tableName).toBe('events');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("read_parquet('"));
    expect(tryQuery).toHaveBeenCalledWith(expect.stringContaining('parquet_file_metadata'));
    expect(tryQuery).toHaveBeenCalledWith(expect.stringContaining('parquet_metadata'));
  });

  it('rejects unsupported files before registering them', async () => {
    await expect(openFileInto(createStore(), new File(['x'], 'notes.txt'))).rejects.toThrow(
      'notes.txt is not a supported file',
    );

    expect(registerFile).not.toHaveBeenCalled();
  });

  it('skips eager SUMMARIZE for CSV files over the size threshold', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce(describeRows());
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const store = createStore();
    const result = await openFileInto(store, csvFile('large.csv', 51 * 1024 * 1024));

    expect(result.warnings).toEqual(['large.csv opened without column statistics because it is larger than 50 MB.']);
    expect(store.state.files.get('large')).toMatchObject({
      format: 'csv',
      summaryStatus: 'deferred',
      profile: { rowCount: null },
    });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('SUMMARIZE'));
  });

  it('can reopen CSV files with all columns as text', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce(describeRows());
    query.mockResolvedValueOnce(summarizeRows());
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    await openFileInto(createStore(), csvFile(), { csvMode: 'text' });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("read_csv('"));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('all_varchar=true'));
  });

  it('cleans up registered files and views when profiling fails', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockRejectedValueOnce(new Error('CSV Error: sniff failed'));
    query.mockResolvedValueOnce({ rows: [] });

    const store = createStore();
    await expect(openFileInto(store, csvFile())).rejects.toThrow('sniff failed');

    expect(query).toHaveBeenCalledWith('DROP VIEW IF EXISTS "sales";');
    expect(unregisterFile).toHaveBeenCalledTimes(1);
    expect(store.state.files.size).toBe(0);
  });
});
