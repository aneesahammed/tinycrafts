import { isNumericSqlType, isTemporalSqlType, normalizeSqlType } from '../duckdb/sql-types.js';
import { quoteIdentifier, quoteString } from '../util/sql-quote.js';
import { columnMap } from './context.js';
import { parseAnalysisPlan } from './plan-schema.js';

export class PlanCompileError extends Error {
  constructor(message, code = 'INVALID_PLAN') {
    super(message);
    this.name = 'PlanCompileError';
    this.code = code;
  }
}

export function compileAnalysisPlan(rawPlan, context) {
  const plan = parseAnalysisPlan(rawPlan);
  return compileParsedAnalysisPlan(plan, context);
}

export function compileParsedAnalysisPlan(plan, context) {
  if (plan.mode !== 'analysis') {
    return {
      mode: plan.mode,
      title: plan.title,
      message: plan.clarifyingQuestion || plan.title || 'This request needs clarification.',
    };
  }
  if (!context?.hasDataset) throw new PlanCompileError('Open a CSV or Parquet file first.', 'NO_DATASET');

  const columns = columnMap(context);
  const select = [];
  const groupBy = [];
  const aliases = new Set();

  for (const dimension of plan.dimensions) {
    const column = requireColumn(columns, dimension.column);
    const expr = dimensionExpression(column, dimension.timeBucket);
    select.push(`${expr} AS ${quoteIdentifier(dimension.alias)}`);
    groupBy.push(expr);
    aliases.add(dimension.alias);
  }

  for (const metric of plan.metrics) {
    const expr = metricExpression(metric, columns);
    select.push(`${expr} AS ${quoteIdentifier(metric.alias)}`);
    aliases.add(metric.alias);
  }

  if (!select.length) throw new PlanCompileError('The analysis plan selected no fields.');
  validateChart(plan.chart, aliases);

  const where = compileFilters(plan.filters, columns);
  const orderBy = compileOrderBy(plan, aliases);
  const limit = Math.max(1, Math.min(1000, Number(plan.limit) || 100));

  const sql = [
    `SELECT ${select.join(', ')}`,
    'FROM active_file',
    where ? `WHERE ${where}` : '',
    groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : '',
    orderBy,
    `LIMIT ${limit};`,
  ].filter(Boolean).join('\n');

  return {
    mode: 'analysis',
    title: plan.title,
    sql,
    chart: plan.chart,
    aliases: [...aliases],
    limit,
  };
}

function dimensionExpression(column, timeBucket) {
  const id = quoteIdentifier(column.name);
  if (!timeBucket) return id;
  if (!isTemporalSqlType(column.type)) {
    throw new PlanCompileError(`Column "${column.name}" is not temporal, so it cannot be bucketed.`);
  }
  return `date_trunc(${quoteString(timeBucket)}, ${id})`;
}

function metricExpression(metric, columns) {
  if (metric.kind === 'sum_product') {
    const left = requireNumericColumn(columns, metric.leftColumn);
    const right = requireNumericColumn(columns, metric.rightColumn);
    return `SUM(CAST(${quoteIdentifier(left.name)} AS DOUBLE) * CAST(${quoteIdentifier(right.name)} AS DOUBLE))`;
  }

  if (metric.agg === 'count' && metric.column == null) return 'COUNT(*)';
  const column = requireColumn(columns, metric.column);
  const id = quoteIdentifier(column.name);
  if (metric.agg === 'count') return `COUNT(${id})`;
  if (metric.agg === 'count_distinct') return `COUNT(DISTINCT ${id})`;
  if (metric.agg === 'sum' || metric.agg === 'avg') {
    requireNumericColumn(columns, column.name);
    return `${metric.agg.toUpperCase()}(${id})`;
  }
  if (metric.agg === 'min' || metric.agg === 'max') {
    if (!isNumericSqlType(column.type) && !isTemporalSqlType(column.type)) {
      throw new PlanCompileError(`Column "${column.name}" is not numeric or temporal.`, 'CLARIFY');
    }
    return `${metric.agg.toUpperCase()}(${id})`;
  }
  throw new PlanCompileError(`Unsupported aggregate: ${metric.agg}`);
}

function compileFilters(filters, columns) {
  return (filters || []).map((filter) => {
    const column = requireColumn(columns, filter.column);
    validateFilter(filter, column);
    const id = quoteIdentifier(column.name);
    if (filter.op === 'is_null') return `${id} IS NULL`;
    if (filter.op === 'is_not_null') return `${id} IS NOT NULL`;
    if (filter.op === 'contains') {
      return `CAST(${id} AS VARCHAR) ILIKE ${quoteString(`%${escapeLike(String(filter.value ?? ''))}%`)} ESCAPE '\\'`;
    }
    if (filter.op === 'between') {
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        throw new PlanCompileError(`Between filter for "${column.name}" needs exactly two values.`);
      }
      return `${id} BETWEEN ${literal(filter.value[0])} AND ${literal(filter.value[1])}`;
    }
    if (filter.op === 'in') {
      if (!Array.isArray(filter.value) || !filter.value.length) {
        throw new PlanCompileError(`In filter for "${column.name}" needs at least one value.`);
      }
      return `${id} IN (${filter.value.map(literal).join(', ')})`;
    }
    return `${id} ${filter.op} ${literal(filter.value)}`;
  }).filter(Boolean).join(' AND ');
}

function validateFilter(filter, column) {
  if (filter.op === 'is_null' || filter.op === 'is_not_null') return;
  if (filter.op === 'contains') {
    if (filter.value == null || Array.isArray(filter.value)) {
      throw filterTypeError(column, 'contains needs a non-null scalar value');
    }
    return;
  }
  if (filter.op === 'between') {
    if (!Array.isArray(filter.value) || filter.value.length !== 2) {
      throw new PlanCompileError(`Between filter for "${column.name}" needs exactly two values.`);
    }
    for (const value of filter.value) validateScalarFilterValue(column, value, filter.op);
    return;
  }
  if (filter.op === 'in') {
    if (!Array.isArray(filter.value) || !filter.value.length) {
      throw new PlanCompileError(`In filter for "${column.name}" needs at least one value.`);
    }
    for (const value of filter.value) validateScalarFilterValue(column, value, filter.op);
    return;
  }
  if (Array.isArray(filter.value)) throw filterTypeError(column, `${filter.op} needs a scalar value`);
  validateScalarFilterValue(column, filter.value, filter.op);
}

function validateScalarFilterValue(column, value, op) {
  if (value == null) throw filterTypeError(column, 'use is_null or is_not_null for null checks');
  if (isNumericSqlType(column.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw filterTypeError(column, 'expected a finite number');
    return;
  }
  if (isTemporalSqlType(column.type)) {
    if (typeof value !== 'string' || !looksTemporalLiteral(value)) {
      throw filterTypeError(column, 'expected an ISO date or timestamp string');
    }
    return;
  }
  if (isBooleanSqlType(column.type)) {
    if (op !== '=' && op !== '!=' && op !== 'in') throw filterTypeError(column, 'booleans only support equality filters');
    if (typeof value !== 'boolean') throw filterTypeError(column, 'expected a boolean');
    return;
  }
  if (isTextSqlType(column.type)) {
    if (op !== '=' && op !== '!=' && op !== 'in') throw filterTypeError(column, 'text columns only support equality, in, and contains filters');
    if (typeof value !== 'string') throw filterTypeError(column, 'expected a string');
    return;
  }
  throw filterTypeError(column, `unsupported filter type ${column.type || 'unknown'}`);
}

function filterTypeError(column, reason) {
  return new PlanCompileError(`Filter for "${column.name}" is invalid: ${reason}.`, 'CLARIFY');
}

function isBooleanSqlType(sqlType) {
  return normalizeSqlType(sqlType) === 'BOOLEAN' || normalizeSqlType(sqlType) === 'BOOL';
}

function isTextSqlType(sqlType) {
  return /^(?:VARCHAR|CHAR|TEXT|STRING|UUID|ENUM)(?:\(|$)/i.test(normalizeSqlType(sqlType));
}

function looksTemporalLiteral(value) {
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim());
}

function compileOrderBy(plan, aliases) {
  const order = plan.orderBy?.length
    ? plan.orderBy
    : plan.dimensions?.length && plan.metrics?.length
      ? [{ field: plan.metrics[0].alias, direction: 'desc' }]
      : [];
  if (!order.length) return '';
  const parts = order.map((item) => {
    if (!aliases.has(item.field)) throw new PlanCompileError(`Order field "${item.field}" is not selected.`);
    return `${quoteIdentifier(item.field)} ${item.direction.toUpperCase()}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

function validateChart(chart, aliases) {
  if (chart.x && !aliases.has(chart.x)) throw new PlanCompileError(`Chart x field "${chart.x}" is not selected.`);
  for (const series of chart.series || []) {
    if (!aliases.has(series.field)) throw new PlanCompileError(`Chart series field "${series.field}" is not selected.`);
  }
}

function requireColumn(columns, name) {
  const column = columns.get(name);
  if (!column) throw new PlanCompileError(`Column "${name}" does not exist.`);
  return column;
}

function requireNumericColumn(columns, name) {
  const column = requireColumn(columns, name);
  if (!isNumericSqlType(column.type)) {
    throw new PlanCompileError(`Column "${name}" is not numeric. Reopen CSV with typed columns or choose a numeric column.`, 'CLARIFY');
  }
  return column;
}

function literal(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new PlanCompileError('Numeric filter value must be finite.');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return quoteString(value);
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}
