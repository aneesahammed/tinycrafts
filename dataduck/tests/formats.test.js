import { describe, expect, it } from 'vitest';
import {
  applyAcceptExtensions,
  acceptExtensions,
  CSV_EAGER_SUMMARY_MAX_BYTES,
  CSV_SUMMARY_LIMIT_STORAGE_KEY,
  csvSummaryLimitBytes,
  csvAutoDetectionFailed,
  detectFileFormat,
  isSupportedFile,
  readerSql,
  shouldEagerSummarize,
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

    const input = document.createElement('input');
    applyAcceptExtensions(input);
    expect(input.getAttribute('accept')).toBe(acceptExtensions);

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
    expect(csvAutoDetectionFailed(new Error('CSV Error: error while sniffing dialect'))).toBe(true);
    expect(csvAutoDetectionFailed(new Error('Out of memory while scanning table csv_export'))).toBe(false);
    expect(csvAutoDetectionFailed(new Error('Binder Error: column not found'))).toBe(false);
    expect(unsupportedFilesMessage(1)).toBe('Skipped 1 unsupported file(s). Open .parquet, .parq, or .csv.');
    expect(unsupportedFilesMessage(3)).toBe('Skipped 3 unsupported file(s). Open .parquet, .parq, or .csv.');
  });

  it('gates eager CSV summaries with a configurable size limit', () => {
    const storage = {
      getItem(key) {
        return key === CSV_SUMMARY_LIMIT_STORAGE_KEY ? String(2 * 1024 * 1024) : null;
      },
    };

    expect(csvSummaryLimitBytes(storage)).toBe(2 * 1024 * 1024);
    expect(csvSummaryLimitBytes({ getItem: () => null })).toBe(CSV_EAGER_SUMMARY_MAX_BYTES);
    expect(csvSummaryLimitBytes({ getItem: () => 'not-a-number' })).toBe(CSV_EAGER_SUMMARY_MAX_BYTES);
    expect(shouldEagerSummarize('csv', { size: 1024 * 1024 }, { storage })).toBe(true);
    expect(shouldEagerSummarize('csv', { size: 3 * 1024 * 1024 }, { storage })).toBe(false);
    expect(shouldEagerSummarize('parquet', { size: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(shouldEagerSummarize('unknown', { size: 1 })).toBe(false);
  });
});
