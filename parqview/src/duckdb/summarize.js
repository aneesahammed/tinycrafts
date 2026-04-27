import { query } from './engine.js';
import { isNumericSqlType, isTemporalSqlType } from './sql-types.js';
import { quoteIdentifier } from '../util/sql-quote.js';

const RX_BOOL = /^BOOLEAN$|^BOOL$/i;
const RX_STRUCT = /^STRUCT/i;
const RX_LIST = /\[\]$|^LIST\(/i;
const RX_TEXT = /^VARCHAR$|^TEXT$|^STRING$|^BLOB$|^CHAR/i;

export function typeIcon(sqlType) {
  const t = String(sqlType || '').trim().toUpperCase();
  if (RX_LIST.test(t)) return '[]';
  if (RX_STRUCT.test(t)) return '{}';
  if (RX_BOOL.test(t)) return 'B';
  if (isNumericSqlType(t)) return '#';
  if (isTemporalSqlType(t)) return '⏱';
  if (RX_TEXT.test(t)) return 'T';
  return '?';
}

export function iconClass(icon) {
  if (icon === '#') return 'n';
  if (icon === '⏱') return 'd';
  if (icon === 'T') return 't';
  return '';
}

export async function summarizeTable(tableName) {
  const result = await query(`SUMMARIZE ${quoteIdentifier(tableName)};`);
  const map = new Map();
  for (const row of result.rows) {
    const name = row.column_name;
    if (!name) continue;
    const rowCount = pickNumber(row.count);
    const nullPercentage = pickPercentage(row.null_percentage);
    const nullCount = pickNumber(row.null_count) ?? inferNullCount(nullPercentage, rowCount);
    map.set(name, {
      type: row.column_type,
      distinct: pickNumber(row.approx_unique),
      nullPercentage,
      nullCount,
      nulls: nullPercentage ?? nullCount,
      rowCount,
      min: row.min,
      max: row.max,
    });
  }
  return map;
}

function pickNumber(value) {
  if (value == null) return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickPercentage(value) {
  const n = pickNumber(value);
  if (n == null || n < 0) return null;
  if (n <= 100) return n;
  if (n <= 10_000) return n / 100;
  return null;
}

function inferNullCount(nullPercentage, rowCount) {
  if (nullPercentage == null || rowCount == null) return null;
  return Math.round((rowCount * nullPercentage) / 100);
}
