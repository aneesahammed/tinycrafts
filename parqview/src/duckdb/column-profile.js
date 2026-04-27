import { query } from './engine.js';
import { HISTOGRAM_BUCKETS, HISTOGRAM_SAMPLE_ROWS } from './profile-constants.js';
import { isHistogramSqlType, isTemporalSqlType } from './sql-types.js';
import { quoteIdentifier } from '../util/sql-quote.js';

const TOP_VALUE_LIMIT = 8;

export async function profileColumn({ table, column, type, stats = {}, totalRows = null }) {
  const kind = profileKindForType(type);
  const base = { table, column, type, stats: { ...stats, rowCount: stats.rowCount ?? totalRows } };

  if (kind === 'histogram') {
    try {
      const histogramResult = await query(buildHistogramSql({
        table,
        column,
        type,
        bucketCount: HISTOGRAM_BUCKETS,
        sampleRows: sampleRowsFor(stats.rowCount ?? totalRows),
      }));
      return reconcileProfileStats({
        ...base,
        kind: 'histogram',
        bins: histogramResult.rows.map((row) => ({
          bucket: toNumber(row.bucket),
          count: toNumber(row.count),
        })),
      });
    } catch (error) {
      console.warn('Column histogram failed, falling back to top values:', error);
    }
  }

  const valuesResult = await query(buildTopValuesSql({ table, column, limit: TOP_VALUE_LIMIT }));
  return reconcileProfileStats({
    ...base,
    kind: 'values',
    values: valuesResult.rows.map((row) => ({
      value: row.value,
      count: toNumber(row.count),
    })),
  });
}

export function profileKindForType(type) {
  return isHistogramSqlType(type) ? 'histogram' : 'values';
}

export function buildHistogramSql({ table, column, type, bucketCount = HISTOGRAM_BUCKETS, sampleRows = null }) {
  const tableId = quoteIdentifier(table);
  const columnId = quoteIdentifier(column);
  const valueExpr = histogramValueExpression(columnId, type);
  const buckets = Math.max(1, Number(bucketCount) || HISTOGRAM_BUCKETS);
  const maxBucket = buckets - 1;
  const sampleClause = formatSampleClause(sampleRows);

  return `
    WITH scoped AS (
      SELECT ${valueExpr} AS x
      FROM ${tableId}${sampleClause}
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
  if (isTemporalSqlType(type)) return `CAST(epoch_ms(${columnId}) AS DOUBLE)`;
  return `CAST(${columnId} AS DOUBLE)`;
}

function formatSampleClause(sampleRows) {
  const rows = toFiniteNonnegative(sampleRows);
  return rows ? ` USING SAMPLE ${Math.trunc(rows)} ROWS` : '';
}

function sampleRowsFor(totalRows) {
  const rows = toFiniteNonnegative(totalRows);
  return rows && rows > HISTOGRAM_SAMPLE_ROWS ? HISTOGRAM_SAMPLE_ROWS : null;
}

function reconcileProfileStats(profile) {
  const rowCount = toFiniteNonnegative(profile.stats?.rowCount);
  const nullCount = toFiniteNonnegative(profile.stats?.nullCount);
  const profiledCount = profiledNonNullCount(profile);
  if (rowCount == null || nullCount == null || profiledCount == null) return profile;
  if (profiledCount + nullCount <= rowCount) return profile;

  console.warn('Column profile stats failed reconciliation; hiding null stats.', {
    table: profile.table,
    column: profile.column,
    rowCount,
    nullCount,
    profiledCount,
  });
  return {
    ...profile,
    stats: {
      ...profile.stats,
      nullPercentage: null,
      nullCount: null,
      nulls: null,
    },
  };
}

function profiledNonNullCount(profile) {
  const rows = profile.kind === 'histogram' ? profile.bins : profile.values;
  if (!Array.isArray(rows)) return null;
  return rows.reduce((sum, row) => sum + toNumber(row.count), 0);
}

function toNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toFiniteNonnegative(value) {
  if (value == null) return null;
  const number = toNumber(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
