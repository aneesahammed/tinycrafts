import { isTemporalColumnType, valueToDisplay } from '../util/format.js';

export function normalizeChartRows(rows = [], columns = [], columnTypes = {}) {
  return rows.map((row) => {
    const next = {};
    for (const column of columns) {
      const value = row?.[column];
      next[column] = normalizeChartValue(value, columnTypes[column]);
    }
    return next;
  });
}

export function normalizeChartValue(value, columnType = null) {
  if (value == null) return null;
  if (isTemporalColumnType(columnType)) return valueToDisplay(value, columnType);
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value instanceof Uint8Array || ArrayBuffer.isView(value)) return valueToDisplay(value);
  if (Array.isArray(value) || typeof value === 'object') return valueToDisplay(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed) && trimmed.length < 20) {
      const number = Number(trimmed);
      if (Number.isFinite(number)) return number;
    }
    return value;
  }
  return value;
}
