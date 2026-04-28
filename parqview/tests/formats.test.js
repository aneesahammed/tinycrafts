import { describe, expect, it } from 'vitest';
import {
  acceptExtensions,
  csvAutoDetectionFailed,
  detectFileFormat,
  isSupportedFile,
  readerSql,
  stripSupportedExtension,
  unsupportedFilesMessage,
} from '../src/duckdb/formats.js';

describe('file format registry', () => {
  it('detects supported Parquet and CSV extensions case-insensitively', () => {
    expect(detectFileFormat('events.parquet')?.id).toBe('parquet');
    expect(detectFileFormat('events.PARQ')?.id).toBe('parquet');
    expect(detectFileFormat('sales.CSV')?.id).toBe('csv');
    expect(detectFileFormat('notes.txt')).toBeNull();
  });

  it('uses one extension list for the file picker and runtime validation', () => {
    expect(acceptExtensions).toBe('.parquet,.parq,.csv');
    expect(isSupportedFile(new File(['a,b\n1,2'], 'sales.csv'))).toBe(true);
    expect(isSupportedFile(new File(['x'], 'notes.txt'))).toBe(false);
  });

  it('strips supported extensions before table-name sanitization', () => {
    expect(stripSupportedExtension('sales.csv')).toBe('sales');
    expect(stripSupportedExtension('events.parquet')).toBe('events');
    expect(stripSupportedExtension('archive.PARQ')).toBe('archive');
    expect(stripSupportedExtension('notes.txt')).toBe('notes.txt');
  });

  it('builds the right DuckDB reader SQL for each supported format', () => {
    expect(readerSql('parquet', 'events.parquet')).toBe("read_parquet('events.parquet')");
    expect(readerSql('csv', 'sales.csv')).toBe("read_csv_auto('sales.csv')");
    expect(readerSql('csv', 'sales.csv', { csvMode: 'text' })).toBe(
      "read_csv('sales.csv', auto_detect=true, all_varchar=true)",
    );
  });

  it('normalizes CSV auto-detection failures and unsupported-file messages', () => {
    expect(csvAutoDetectionFailed(new Error('Conversion Error: Could not convert string "x" to INT64'))).toBe(true);
    expect(csvAutoDetectionFailed(new Error('Binder Error: column not found'))).toBe(false);
    expect(unsupportedFilesMessage(1)).toBe('Skipped 1 unsupported file(s). Open .parquet, .parq, or .csv.');
    expect(unsupportedFilesMessage(3)).toBe('Skipped 3 unsupported file(s). Open .parquet, .parq, or .csv.');
  });
});
