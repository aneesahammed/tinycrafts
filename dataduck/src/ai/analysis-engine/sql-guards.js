import { isNumericSqlType, isTemporalSqlType, normalizeSqlType } from '../../duckdb/sql-types.js';
import { quoteIdentifier, quoteString } from '../../util/sql-quote.js';
import { ANALYSIS_ERROR_CODES } from './errors.js';

export class AnalysisCompileError extends Error {
  constructor(message, code = ANALYSIS_ERROR_CODES.INVALID_PLAN, { kind = 'clarify' } = {}) {
    super(message);
    this.name = 'AnalysisCompileError';
    this.code = code;
    this.kind = kind;
  }
}

export function contextColumnMap(context) {
  return new Map((context?.columns || []).map((column) => [column.name, column]));
}

export function requireColumn(columns, name) {
  const column = columns.get(name);
  if (!column) throw new AnalysisCompileError(`Column "${name}" does not exist.`, ANALYSIS_ERROR_CODES.COLUMN_NOT_FOUND);
  return column;
}

export function requireNumericColumn(columns, name) {
  const column = requireColumn(columns, name);
  if (!isNumericSqlType(column.type)) {
    throw new AnalysisCompileError(`Column "${name}" is not numeric. Reopen CSV with typed columns or choose a numeric column.`, ANALYSIS_ERROR_CODES.COLUMN_TYPE_MISMATCH);
  }
  return column;
}

export function requireTemporalColumn(columns, name) {
  const column = requireColumn(columns, name);
  if (!isTemporalSqlType(column.type)) {
    throw new AnalysisCompileError(`Column "${name}" is not a date/time column. Pick a temporal column or ask a non-trend question.`, ANALYSIS_ERROR_CODES.COLUMN_TYPE_MISMATCH);
  }
  return column;
}

export function rejectUnsupportedAnalyticalType(column, purpose = 'analysis') {
  if (isNestedOrBinaryType(column.type)) {
    throw new AnalysisCompileError(`Column "${column.name}" has type ${column.type}, which is not supported for ${purpose}.`, ANALYSIS_ERROR_CODES.COLUMN_TYPE_UNSUPPORTED);
  }
}

export function dimensionExpression(column, timeBucket = null) {
  rejectUnsupportedAnalyticalType(column, 'grouping');
  const id = quoteIdentifier(column.name);
  if (!timeBucket) return id;
  if (!isTemporalSqlType(column.type)) {
    throw new AnalysisCompileError(`Column "${column.name}" is not temporal, so it cannot be bucketed.`, ANALYSIS_ERROR_CODES.COLUMN_TYPE_MISMATCH);
  }
  return `date_trunc(${quoteString(timeBucket)}, ${id})`;
}

export function aggregateMetricExpression(metric, columns) {
  if (metric.agg === 'count' && metric.column == null) return 'COUNT(*)';
  const column = requireColumn(columns, metric.column);
  rejectUnsupportedAnalyticalType(column, 'aggregation');
  const id = quoteIdentifier(column.name);
  if (metric.agg === 'count') return `COUNT(${id})`;
  if (metric.agg === 'count_distinct') return `COUNT(DISTINCT ${id})`;
  if (metric.agg === 'sum' || metric.agg === 'avg') {
    requireNumericColumn(columns, column.name);
    return `${metric.agg.toUpperCase()}(${id})`;
  }
  if (metric.agg === 'min' || metric.agg === 'max') {
    if (!isNumericSqlType(column.type) && !isTemporalSqlType(column.type)) {
      throw new AnalysisCompileError(`Column "${column.name}" is not numeric or temporal.`, ANALYSIS_ERROR_CODES.COLUMN_TYPE_MISMATCH);
    }
    return `${metric.agg.toUpperCase()}(${id})`;
  }
  throw new AnalysisCompileError(`Unsupported aggregate: ${metric.agg}`, ANALYSIS_ERROR_CODES.UNSUPPORTED_AGGREGATE);
}

export function legacyMetricExpression(metric, columns) {
  if (metric.kind === 'sum_product') {
    const left = requireNumericColumn(columns, metric.leftColumn);
    const right = requireNumericColumn(columns, metric.rightColumn);
    return `SUM(CAST(${quoteIdentifier(left.name)} AS DOUBLE) * CAST(${quoteIdentifier(right.name)} AS DOUBLE))`;
  }
  return aggregateMetricExpression(metric, columns);
}

export function compileFilterList(filters = [], columns) {
  const params = [];
  const sql = (filters || []).map((filter) => compileFilter(filter, columns, params)).filter(Boolean).join(' AND ');
  return { sql, params };
}

export function compileFilter(filter, columns, params) {
  const column = requireColumn(columns, filter.column);
  rejectUnsupportedAnalyticalType(column, 'filtering');
  validateFilter(filter, column);
  const id = quoteIdentifier(column.name);
  if (filter.op === 'is_null') return `${id} IS NULL`;
  if (filter.op === 'is_not_null') return `${id} IS NOT NULL`;
  if (filter.op === 'contains') {
    params.push(`%${escapeLike(String(filter.value ?? ''))}%`);
    return `CAST(${id} AS VARCHAR) ILIKE ? ESCAPE '\\'`;
  }
  if (filter.op === 'between') {
    if (!Array.isArray(filter.value) || filter.value.length !== 2) {
      throw new AnalysisCompileError(`Between filter for "${column.name}" needs exactly two values.`, ANALYSIS_ERROR_CODES.FILTER_INVALID);
    }
    params.push(coerceFilterValue(column, filter.value[0]), coerceFilterValue(column, filter.value[1]));
    return `${id} BETWEEN ? AND ?`;
  }
  if (filter.op === 'in') {
    if (!Array.isArray(filter.value) || !filter.value.length) {
      throw new AnalysisCompileError(`In filter for "${column.name}" needs at least one value.`, ANALYSIS_ERROR_CODES.FILTER_INVALID);
    }
    params.push(...filter.value.map((value) => coerceFilterValue(column, value)));
    return `${id} IN (${filter.value.map(() => '?').join(', ')})`;
  }
  params.push(coerceFilterValue(column, filter.value));
  return `${id} ${filter.op} ?`;
}

export function validateFilter(filter, column) {
  if (filter.op === 'is_null' || filter.op === 'is_not_null') return;
  if (filter.op === 'contains') {
    if (filter.value == null || Array.isArray(filter.value)) {
      throw filterTypeError(column, 'contains needs a non-null scalar value');
    }
    return;
  }
  if (filter.op === 'between') {
    if (!Array.isArray(filter.value) || filter.value.length !== 2) {
      throw new AnalysisCompileError(`Between filter for "${column.name}" needs exactly two values.`, ANALYSIS_ERROR_CODES.FILTER_INVALID);
    }
    for (const value of filter.value) validateScalarFilterValue(column, value, filter.op);
    return;
  }
  if (filter.op === 'in') {
    if (!Array.isArray(filter.value) || !filter.value.length) {
      throw new AnalysisCompileError(`In filter for "${column.name}" needs at least one value.`, ANALYSIS_ERROR_CODES.FILTER_INVALID);
    }
    for (const value of filter.value) validateScalarFilterValue(column, value, filter.op);
    return;
  }
  if (Array.isArray(filter.value)) throw filterTypeError(column, `${filter.op} needs a scalar value`);
  validateScalarFilterValue(column, filter.value, filter.op);
}

export function validateScalarFilterValue(column, value, op) {
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

export function validateChartFields(chart, aliases) {
  if (!chart) return;
  if (chart.x && !aliases.has(chart.x)) throw new AnalysisCompileError(`Chart x field "${chart.x}" is not selected.`, ANALYSIS_ERROR_CODES.CHART_FIELD_NOT_SELECTED);
  for (const series of chart.series || []) {
    if (!aliases.has(series.field)) throw new AnalysisCompileError(`Chart series field "${series.field}" is not selected.`, ANALYSIS_ERROR_CODES.CHART_FIELD_NOT_SELECTED);
  }
}

export function orderBySql(orderBy = [], aliases) {
  if (!orderBy.length) return '';
  const parts = orderBy.map((item) => {
    if (!aliases.has(item.field)) throw new AnalysisCompileError(`Order field "${item.field}" is not selected.`, ANALYSIS_ERROR_CODES.ORDER_FIELD_NOT_SELECTED);
    return `${quoteIdentifier(item.field)} ${String(item.direction || 'asc').toUpperCase()}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}

function coerceFilterValue(column, value) {
  if (isTemporalSqlType(column.type)) return String(value);
  return value;
}

function filterTypeError(column, reason) {
  return new AnalysisCompileError(`Filter for "${column.name}" is invalid: ${reason}.`, ANALYSIS_ERROR_CODES.FILTER_INVALID);
}

export function isBooleanSqlType(sqlType) {
  const normalized = normalizeSqlType(sqlType);
  return normalized === 'BOOLEAN' || normalized === 'BOOL';
}

export function isTextSqlType(sqlType) {
  return /^(?:VARCHAR|CHAR|TEXT|STRING|UUID|ENUM)(?:\(|$)/i.test(normalizeSqlType(sqlType));
}

export function isNestedOrBinaryType(sqlType) {
  return /^(?:BLOB|STRUCT|MAP|UNION|LIST|ARRAY)(?:\(|$)|\[\]$/i.test(normalizeSqlType(sqlType));
}

function looksTemporalLiteral(value) {
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(String(value).trim());
}
