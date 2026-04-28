import { quoteString } from '../util/sql-quote.js';

export const CSV_EAGER_SUMMARY_MAX_BYTES = 50 * 1024 * 1024;
export const CSV_SUMMARY_LIMIT_STORAGE_KEY = 'dataduck:csv-summary-limit-bytes';

export const FILE_FORMATS = [
  {
    id: 'parquet',
    label: 'Parquet',
    extensions: ['.parquet', '.parq'],
    hasParquetMetadata: true,
  },
  {
    id: 'csv',
    label: 'CSV',
    extensions: ['.csv'],
    hasParquetMetadata: false,
  },
];

const EXTENSION_TO_FORMAT = new Map(
  FILE_FORMATS.flatMap((format) => format.extensions.map((extension) => [extension, format])),
);

export const acceptExtensions = FILE_FORMATS.flatMap((format) => format.extensions).join(',');
const SUPPORTED_FILE_COPY = '.parquet, .parq, or .csv';

export function applyAcceptExtensions(input) {
  input?.setAttribute?.('accept', acceptExtensions);
}

export function detectFileFormat(input) {
  const name = fileName(input).toLowerCase();
  for (const extension of [...EXTENSION_TO_FORMAT.keys()].sort((a, b) => b.length - a.length)) {
    if (name.endsWith(extension)) return EXTENSION_TO_FORMAT.get(extension);
  }
  return null;
}

export function formatById(formatId) {
  return FILE_FORMATS.find((format) => format.id === formatId) || null;
}

export function isSupportedFile(file) {
  return Boolean(detectFileFormat(file));
}

export function stripSupportedExtension(input) {
  const name = fileName(input);
  const lower = name.toLowerCase();
  for (const extension of [...EXTENSION_TO_FORMAT.keys()].sort((a, b) => b.length - a.length)) {
    if (lower.endsWith(extension)) return name.slice(0, -extension.length);
  }
  return name;
}

export function readerSql(formatId, virtualName, options = {}) {
  if (formatId === 'parquet') return `read_parquet(${quoteString(virtualName)})`;
  if (formatId === 'csv') {
    if (options.csvMode === 'text') {
      return `read_csv(${quoteString(virtualName)}, auto_detect=true, all_varchar=true)`;
    }
    return `read_csv_auto(${quoteString(virtualName)})`;
  }
  throw new Error(`Unsupported file format: ${formatId || 'unknown'}`);
}

export function csvSummaryLimitBytes(storage = null) {
  let raw = null;
  let source = storage;
  if (!source) {
    try {
      source = globalThis.localStorage;
    } catch {
      source = null;
    }
  }
  try {
    raw = source?.getItem?.(CSV_SUMMARY_LIMIT_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw == null || raw === '') return CSV_EAGER_SUMMARY_MAX_BYTES;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : CSV_EAGER_SUMMARY_MAX_BYTES;
}

export function shouldEagerSummarize(formatId, file, options = {}) {
  if (formatId === 'parquet') return true;
  if (formatId !== 'csv') return false;
  return Number(file?.size || 0) <= csvSummaryLimitBytes(options.storage);
}

export function deferredSummaryWarning(file, options = {}) {
  const limit = csvSummaryLimitBytes(options.storage);
  return `${file?.name || 'CSV file'} opened without column statistics because it is larger than ${formatBytes(limit)}.`;
}

export function unsupportedFilesMessage(count) {
  if (!count) return '';
  return `Skipped ${count} unsupported file(s). Open ${SUPPORTED_FILE_COPY}.`;
}

export function unsupportedFileTypeMessage() {
  return `Unsupported file type. Open ${SUPPORTED_FILE_COPY}.`;
}

export function csvAutoDetectionFailed(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('read_csv') ||
    message.includes('sniff') ||
    message.includes('conversion error') ||
    message.includes('could not convert') ||
    message.includes('invalid unicode')
  );
}

function fileName(input) {
  return typeof input === 'string' ? input : String(input?.name || '');
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024 && bytes % 1024 === 0) return `${bytes / 1024} KB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
