import { isNumericSqlType, isTemporalSqlType } from '../../duckdb/sql-types.js';
import { quoteIdentifier, quoteString } from '../../util/sql-quote.js';
import { ANALYSIS_ERROR_CODES } from './errors.js';
import {
  aggregateMetricExpression,
  AnalysisCompileError,
  compileFilterList,
  contextColumnMap,
  dimensionExpression,
  orderBySql,
  requireColumn,
  requireNumericColumn,
  requireTemporalColumn,
} from './sql-guards.js';

export const MAX_RUNTIME_ROWS = 1000;
export const MAX_MISSINGNESS_COLUMNS = 100;
export const MAX_CORRELATION_PAIRS = 28;

export function compileToolPlan(plan, context) {
  if (plan.mode !== 'analysis') {
    return {
      mode: plan.mode,
      title: plan.title,
      message: plan.clarifyingQuestion || plan.title || 'This request needs clarification.',
      jobs: [],
    };
  }
  if (!context?.hasDataset) {
    throw new AnalysisCompileError('Open a CSV or Parquet file first.', ANALYSIS_ERROR_CODES.NO_DATASET, { kind: 'error' });
  }
  const columns = contextColumnMap(context);
  return {
    mode: 'analysis',
    title: plan.title,
    jobs: plan.steps.map((step) => compileStep(step, columns, context)),
  };
}

export function compileStep(step, columns, context) {
  if (step.tool === 'profile_overview') return compileProfileOverview(step, context);
  if (step.tool === 'missingness') return compileMissingness(step, columns, context);
  if (step.tool === 'top_n') return compileTopN(step, columns);
  if (step.tool === 'top_rows') return compileTopRows(step, columns);
  if (step.tool === 'aggregate_query') return compileAggregateQuery(step, columns);
  if (step.tool === 'histogram') return compileHistogram(step, columns);
  if (step.tool === 'trend') return compileTrend(step, columns);
  if (step.tool === 'outliers') return compileOutliers(step, columns);
  if (step.tool === 'correlation') return compileCorrelation(step, columns);
  throw new AnalysisCompileError(`Unsupported analysis tool: ${step.tool}`);
}

function compileProfileOverview(step, context) {
  const columns = context.columns || [];
  const numericColumns = columns.filter((column) => isNumericSqlType(column.type)).length;
  const temporalColumns = columns.filter((column) => isTemporalSqlType(column.type)).length;
  const rows = [{
    row_count: maxKnownRowCount(columns),
    column_count: columns.length,
    numeric_columns: numericColumns,
    temporal_columns: temporalColumns,
    missing_columns: columns.filter((column) => Number(column.nullCount || 0) > 0).length,
  }];
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'metadata',
    rows,
    columns: Object.keys(rows[0]),
    columnTypes: {},
    chart: { kind: 'table', x: null, series: [] },
    sql: null,
    params: [],
  };
}

function compileMissingness(step, columns) {
  const selected = selectedColumns(step.columns, columns, MAX_MISSINGNESS_COLUMNS);
  const parts = selected.map((column) => {
    const id = quoteIdentifier(column.name);
    return [
      'SELECT',
      `${quoteString(column.name)} AS column_name,`,
      'COUNT(*) AS row_count,',
      `SUM(CASE WHEN ${id} IS NULL THEN 1 ELSE 0 END) AS null_count,`,
      `ROUND((SUM(CASE WHEN ${id} IS NULL THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(*), 0), 4) AS null_percentage`,
      'FROM active_file',
    ].join(' ');
  });
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: `${parts.join('\nUNION ALL\n')}\nORDER BY null_percentage DESC, column_name ASC;`,
    params: [],
    chart: {
      kind: 'bar',
      x: 'column_name',
      series: [{ field: 'null_percentage', label: 'Null %', mark: 'bar', axis: 'left' }],
    },
  };
}

function compileTopN(step, columns) {
  const dimension = requireColumn(columns, step.dimension);
  const metricExpr = aggregateMetricExpression(step.metric, columns);
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const limit = Math.max(1, Math.min(100, Number(step.n) || 10));
  const direction = String(step.direction || 'desc').toUpperCase();
  const dimensionId = quoteIdentifier(dimension.name);
  const metricAlias = quoteIdentifier(step.metric.alias);
  const dimensionAlias = quoteIdentifier('dimension_value');
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: [
      `SELECT ${dimensionId} AS ${dimensionAlias}, ${metricExpr} AS ${metricAlias}`,
      'FROM active_file',
      where ? `WHERE ${where}` : '',
      `GROUP BY ${dimensionId}`,
      `ORDER BY ${metricAlias} ${direction}, ${dimensionAlias} ASC`,
      `LIMIT ${limit};`,
    ].filter(Boolean).join('\n'),
    params,
    chart: {
      kind: 'bar',
      x: 'dimension_value',
      series: [{ field: step.metric.alias, label: labelForAlias(step.metric.alias), mark: 'bar', axis: 'left' }],
    },
  };
}

// top_rows — raw row listing sorted by a column. Distinct from top_n: no
// GROUP BY, no aggregation, returns all original columns. SELECT * is safe
// because runtime row limits and persisted-artifact caps already apply
// downstream; rows themselves are not sent to providers.
function compileTopRows(step, columns) {
  const column = requireColumn(columns, step.column);
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const limit = Math.max(1, Math.min(100, Number(step.n) || 10));
  const direction = String(step.direction || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const colId = quoteIdentifier(column.name);
  const nullsClause = direction === 'DESC' ? 'NULLS LAST' : 'NULLS LAST';
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: [
      `SELECT *`,
      'FROM active_file',
      where ? `WHERE ${where}` : '',
      `ORDER BY ${colId} ${direction} ${nullsClause}`,
      `LIMIT ${limit};`,
    ].filter(Boolean).join('\n'),
    params,
    chart: { kind: 'table', x: null, series: [] },
  };
}

function compileAggregateQuery(step, columns) {
  const select = [];
  const groupBy = [];
  const aliases = new Set();
  for (const dimension of step.dimensions) {
    const column = requireColumn(columns, dimension.column);
    const expr = dimensionExpression(column, dimension.timeBucket);
    select.push(`${expr} AS ${quoteIdentifier(dimension.alias)}`);
    groupBy.push(expr);
    aliases.add(dimension.alias);
  }
  for (const metric of step.metrics) {
    const expr = aggregateMetricExpression(metric, columns);
    select.push(`${expr} AS ${quoteIdentifier(metric.alias)}`);
    aliases.add(metric.alias);
  }
  if (!select.length) throw new AnalysisCompileError('The aggregate query selected no fields.', ANALYSIS_ERROR_CODES.EMPTY_SELECTION);
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const defaultOrder = step.dimensions.length && step.metrics.length
    ? [{ field: step.metrics[0].alias, direction: 'desc' }]
    : [];
  const orderBy = orderBySql(step.orderBy?.length ? step.orderBy : defaultOrder, aliases);
  const limit = Math.max(1, Math.min(MAX_RUNTIME_ROWS, Number(step.limit) || 100));
  const x = step.dimensions[0]?.alias || null;
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: [
      `SELECT ${select.join(', ')}`,
      'FROM active_file',
      where ? `WHERE ${where}` : '',
      groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : '',
      orderBy,
      `LIMIT ${limit};`,
    ].filter(Boolean).join('\n'),
    params,
    chart: {
      kind: x && step.metrics.length ? 'bar' : 'table',
      x,
      series: step.metrics.slice(0, 6).map((metric) => ({
        field: metric.alias,
        label: labelForAlias(metric.alias),
        mark: 'bar',
        axis: 'left',
      })),
    },
  };
}

function compileHistogram(step, columns) {
  const column = requireColumn(columns, step.column);
  if (!isNumericSqlType(column.type) && !isTemporalSqlType(column.type)) {
    throw new AnalysisCompileError(`Column "${column.name}" is not numeric or temporal.`, ANALYSIS_ERROR_CODES.COLUMN_TYPE_MISMATCH);
  }
  const id = quoteIdentifier(column.name);
  const valueExpr = isTemporalSqlType(column.type) ? `CAST(epoch_ms(${id}) AS DOUBLE)` : `CAST(${id} AS DOUBLE)`;
  const bins = Math.max(2, Math.min(50, Number(step.bins) || 20));
  const maxBucket = bins - 1;
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const whereClause = [`${id} IS NOT NULL`, where].filter(Boolean).join(' AND ');
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: `
WITH scoped AS (
  SELECT ${valueExpr} AS x
  FROM active_file
  WHERE ${whereClause}
),
bounds AS (
  SELECT MIN(x) AS lo, MAX(x) AS hi
  FROM scoped
),
bucketed AS (
  SELECT
    CASE
      WHEN bounds.hi = bounds.lo OR bounds.hi IS NULL THEN 0
      ELSE CAST(LEAST(${maxBucket}, GREATEST(0, FLOOR(((scoped.x - bounds.lo) / NULLIF(bounds.hi - bounds.lo, 0)) * ${bins}))) AS INTEGER)
    END AS bucket,
    bounds.lo,
    bounds.hi
  FROM scoped, bounds
)
SELECT
  bucket,
  CASE WHEN hi = lo OR hi IS NULL THEN lo ELSE lo + ((hi - lo) / ${bins}) * bucket END AS lower_bound,
  CASE WHEN hi = lo OR hi IS NULL THEN hi ELSE lo + ((hi - lo) / ${bins}) * (bucket + 1) END AS upper_bound,
  COUNT(*) AS count
FROM bucketed
GROUP BY bucket, lower_bound, upper_bound
ORDER BY bucket;`.trim(),
    params,
    chart: {
      kind: 'histogram',
      x: 'bucket',
      series: [{ field: 'count', label: 'Count', mark: 'bar', axis: 'left' }],
    },
  };
}

function compileTrend(step, columns) {
  const timeColumn = requireTemporalColumn(columns, step.timeColumn);
  const metricExpr = aggregateMetricExpression(step.metric, columns);
  const timeExpr = `date_trunc(${quoteString(step.bucket)}, ${quoteIdentifier(timeColumn.name)})`;
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const limit = Math.max(1, Math.min(MAX_RUNTIME_ROWS, Number(step.limit) || MAX_RUNTIME_ROWS));
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: [
      `SELECT ${timeExpr} AS time_bucket, ${metricExpr} AS ${quoteIdentifier(step.metric.alias)}`,
      'FROM active_file',
      where ? `WHERE ${where}` : '',
      `GROUP BY ${timeExpr}`,
      'ORDER BY time_bucket ASC',
      `LIMIT ${limit};`,
    ].filter(Boolean).join('\n'),
    params,
    chart: {
      kind: 'line',
      x: 'time_bucket',
      series: [{ field: step.metric.alias, label: labelForAlias(step.metric.alias), mark: 'line', axis: 'left' }],
    },
  };
}

function compileOutliers(step, columns) {
  const column = requireNumericColumn(columns, step.column);
  const id = quoteIdentifier(column.name);
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const whereClause = [`${id} IS NOT NULL`, where].filter(Boolean).join(' AND ');
  const limit = Math.max(1, Math.min(50, Number(step.limit) || 20));
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: `
WITH scoped AS (
  SELECT CAST(${id} AS DOUBLE) AS value
  FROM active_file
  WHERE ${whereClause}
),
quartiles AS (
  SELECT quantile_cont(value, 0.25) AS q1, quantile_cont(value, 0.75) AS q3
  FROM scoped
),
bounds AS (
  SELECT q1, q3, q1 - 1.5 * (q3 - q1) AS lower_bound, q3 + 1.5 * (q3 - q1) AS upper_bound
  FROM quartiles
)
SELECT value, lower_bound, upper_bound,
  CASE WHEN value < lower_bound THEN 'low' ELSE 'high' END AS outlier_side
FROM scoped, bounds
WHERE value < lower_bound OR value > upper_bound
ORDER BY ABS(value - ((lower_bound + upper_bound) / 2)) DESC
LIMIT ${limit};`.trim(),
    params,
    chart: {
      kind: 'scatter',
      x: 'value',
      series: [{ field: 'value', label: column.name, mark: 'point', axis: 'left' }],
    },
  };
}

function compileCorrelation(step, columns) {
  const selected = step.columns.map((name) => requireNumericColumn(columns, name));
  const pairs = [];
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) pairs.push([selected[i], selected[j]]);
  }
  if (pairs.length > MAX_CORRELATION_PAIRS) {
    throw new AnalysisCompileError('Correlation is limited to 28 column pairs.', ANALYSIS_ERROR_CODES.TOO_MANY_COLUMNS);
  }
  const { sql: where, params } = compileFilterList(step.filters, columns);
  const parts = pairs.map(([left, right]) => {
    const leftId = quoteIdentifier(left.name);
    const rightId = quoteIdentifier(right.name);
    const nonNull = `${leftId} IS NOT NULL AND ${rightId} IS NOT NULL`;
    return [
      'SELECT',
      `${quoteString(left.name)} AS column_x,`,
      `${quoteString(right.name)} AS column_y,`,
      `corr(CAST(${leftId} AS DOUBLE), CAST(${rightId} AS DOUBLE)) AS correlation,`,
      'COUNT(*) AS rows_used',
      'FROM active_file',
      `WHERE ${[nonNull, where].filter(Boolean).join(' AND ')}`,
    ].join(' ');
  });
  return {
    id: step.id,
    tool: step.tool,
    title: step.title,
    kind: 'query',
    sql: `${parts.join('\nUNION ALL\n')}\nORDER BY ABS(correlation) DESC;`,
    params: repeatParams(params, pairs.length),
    chart: {
      kind: 'bar',
      x: 'column_y',
      series: [{ field: 'correlation', label: 'Pearson correlation', mark: 'bar', axis: 'left' }],
    },
  };
}

function selectedColumns(names, columns, maxColumns) {
  const all = [...columns.values()];
  const selected = names?.length ? names.map((name) => requireColumn(columns, name)) : all;
  if (selected.length > maxColumns) {
    throw new AnalysisCompileError(`This analysis is limited to ${maxColumns} columns. Ask about specific columns.`, ANALYSIS_ERROR_CODES.TOO_MANY_COLUMNS);
  }
  return selected;
}

function maxKnownRowCount(columns) {
  const counts = columns.map((column) => Number(column.rowCount)).filter((value) => Number.isFinite(value));
  return counts.length ? Math.max(...counts) : null;
}

function repeatParams(params, count) {
  const repeated = [];
  for (let i = 0; i < count; i += 1) repeated.push(...params);
  return repeated;
}

function labelForAlias(alias) {
  return String(alias || '')
    .replace(/_(?:sum|avg|min|max|count|count_distinct)$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || 'Value';
}
