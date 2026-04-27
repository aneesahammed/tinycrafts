import { query } from './engine.js';
import { quoteIdentifier } from '../util/sql-quote.js';

const RX_NUM = /^(TINY|SMALL|BIG|HUGE)?INT(EGER)?$|^DECIMAL|^DOUBLE|^FLOAT|^REAL|^NUMERIC/i;
const RX_TIME = /^DATE$|^TIME(STAMP)?(\s|$)|^INTERVAL$/i;
const RX_BOOL = /^BOOLEAN$|^BOOL$/i;
const RX_STRUCT = /^STRUCT/i;
const RX_LIST = /\[\]$|^LIST\(/i;
const RX_TEXT = /^VARCHAR$|^TEXT$|^STRING$|^BLOB$|^CHAR/i;

export function typeIcon(sqlType) {
  const t = String(sqlType || '').trim().toUpperCase();
  if (RX_LIST.test(t)) return '[]';
  if (RX_STRUCT.test(t)) return '{}';
  if (RX_BOOL.test(t)) return 'B';
  if (RX_NUM.test(t)) return '#';
  if (RX_TIME.test(t)) return '⏱';
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
    map.set(name, {
      type: row.column_type,
      distinct: pickNumber(row.approx_unique),
      nullPercentage: pickNumber(row.null_percentage),
      nullCount: pickNumber(row.null_count),
      nulls: pickNumber(row.null_percentage) ?? pickNumber(row.null_count),
      rowCount: pickNumber(row.count),
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
