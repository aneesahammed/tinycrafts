import { query } from './engine.js';
import { quoteIdentifier } from '../util/sql-quote.js';

const HISTOGRAM_BUCKETS = 18;
const TOP_VALUE_LIMIT = 8;
const RX_NUM = /^(TINY|SMALL|BIG|HUGE)?INT(EGER)?$|^U?(TINY|SMALL|BIG|HUGE)?INT$|^DECIMAL|^DOUBLE|^FLOAT|^REAL|^NUMERIC/i;
const RX_TIME = /^DATE$|^TIME(STAMP)?(\s|$)|^TIMESTAMP_|^INTERVAL$/i;

export async function profileColumn({ table, column, type, stats = {}, totalRows = null }) {
  const kind = profileKindForType(type);
  const base = { table, column, type, stats: { ...stats, rowCount: stats.rowCount ?? totalRows } };

  if (kind === 'histogram') {
    try {
      const result = await query(buildHistogramSql({ table, column, type, bucketCount: HISTOGRAM_BUCKETS }));
      return {
        ...base,
        kind: 'histogram',
        bins: result.rows.map((row) => ({
          bucket: toNumber(row.bucket),
          count: toNumber(row.count),
        })),
      };
    } catch (error) {
      console.warn('Column histogram failed, falling back to top values:', error);
    }
  }

  const result = await query(buildTopValuesSql({ table, column, limit: TOP_VALUE_LIMIT }));
  return {
    ...base,
    kind: 'values',
    values: result.rows.map((row) => ({
      value: row.value,
      count: toNumber(row.count),
    })),
  };
}

export function profileKindForType(type) {
  const t = String(type || '').trim().toUpperCase();
  if (RX_NUM.test(t) || RX_TIME.test(t)) return 'histogram';
  return 'values';
}

export function buildHistogramSql({ table, column, type, bucketCount = HISTOGRAM_BUCKETS }) {
  const tableId = quoteIdentifier(table);
  const columnId = quoteIdentifier(column);
  const valueExpr = histogramValueExpression(columnId, type);
  const buckets = Math.max(1, Number(bucketCount) || HISTOGRAM_BUCKETS);
  const maxBucket = buckets - 1;

  return `
    WITH scoped AS (
      SELECT ${valueExpr} AS x
      FROM ${tableId}
      WHERE ${columnId} IS NOT NULL
    ),
    bounds AS (
      SELECT MIN(x) AS lo, MAX(x) AS hi
      FROM scoped
    ),
    bucketed AS (
      SELECT
        CASE
          WHEN bounds.hi = bounds.lo OR bounds.hi IS NULL THEN 0
          ELSE CAST(LEAST(${maxBucket}, GREATEST(0, FLOOR(((scoped.x - bounds.lo) / NULLIF(bounds.hi - bounds.lo, 0)) * ${buckets}))) AS INTEGER)
        END AS bucket
      FROM scoped, bounds
    )
    SELECT bucket, COUNT(*) AS count
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket;
  `;
}

export function buildTopValuesSql({ table, column, limit = TOP_VALUE_LIMIT }) {
  const tableId = quoteIdentifier(table);
  const columnId = quoteIdentifier(column);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || TOP_VALUE_LIMIT));
  return `
    SELECT CAST(${columnId} AS VARCHAR) AS value, COUNT(*) AS count
    FROM ${tableId}
    WHERE ${columnId} IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC, value ASC
    LIMIT ${safeLimit};
  `;
}

function histogramValueExpression(columnId, type) {
  const t = String(type || '').trim().toUpperCase();
  if (RX_TIME.test(t)) return `CAST(epoch_ms(${columnId}) AS DOUBLE)`;
  return `CAST(${columnId} AS DOUBLE)`;
}

function toNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
