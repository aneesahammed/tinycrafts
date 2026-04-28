import { csvAutoDetectionFailed, detectFileFormat } from '../duckdb/formats.js';

export function showCsvRecoveryToast({ error, file, csvMode = 'auto', replaceTable = null, showToast, reopen }) {
  if (!file || csvMode === 'text') return false;
  if (detectFileFormat(file)?.id !== 'csv') return false;
  if (!csvAutoDetectionFailed(error)) return false;

  showToast('CSV auto-detection could not read this file.', 'error', {
    label: 'Open columns as text',
    run: () => reopen(file, replaceTable),
  });
  return true;
}
