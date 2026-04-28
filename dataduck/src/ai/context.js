import { isNumericSqlType, isTemporalSqlType } from '../duckdb/sql-types.js';
import { datasetFingerprint } from './dataset-fingerprint.js';

export function buildDatasetContext(state) {
  const activeTable = state?.activeTable || null;
  const record = activeTable ? state?.files?.get?.(activeTable) : null;
  if (!activeTable || !record) {
    return {
      hasDataset: false,
      activeTable: null,
      fingerprint: datasetFingerprint(null, null),
      columns: [],
      summaryStatus: 'missing',
    };
  }

  const schema = Array.isArray(record.profile?.schema) ? record.profile.schema : [];
  const summary = record.summary instanceof Map ? record.summary : new Map();
  const columns = schema.map((column) => {
    const name = String(column.column_name || '');
    const type = String(column.column_type || '');
    const stats = summary.get(name) || {};
    const safe = {
      name,
      type,
      rowCount: pickNumber(stats.rowCount),
      nullCount: pickNumber(stats.nullCount),
      nullPercentage: pickNumber(stats.nullPercentage),
      distinct: pickNumber(stats.distinct),
    };
    if (isNumericSqlType(type) || isTemporalSqlType(type)) {
      safe.min = stats.min ?? null;
      safe.max = stats.max ?? null;
    }
    return safe;
  });

  return {
    hasDataset: true,
    activeTable,
    table: 'active_file',
    fileName: record.file?.name || activeTable,
    format: record.format || null,
    size: record.size || 0,
    summaryStatus: record.summaryStatus || 'missing',
    fingerprint: datasetFingerprint(record, activeTable),
    columns,
  };
}

export function columnMap(context) {
  return new Map((context?.columns || []).map((column) => [column.name, column]));
}

function pickNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
