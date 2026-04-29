import { quoteIdentifier } from '../util/sql-quote.js';
import { columnMap } from './context.js';
import { parseAnalysisPlan } from './plan-schema.js';
import { ANALYSIS_ERROR_CODES } from './analysis-engine/errors.js';
import {
  AnalysisCompileError,
  compileFilterList,
  contextColumnMap,
  dimensionExpression,
  escapeLike,
  legacyMetricExpression,
  orderBySql,
  validateChartFields,
} from './analysis-engine/sql-guards.js';

export class PlanCompileError extends AnalysisCompileError {
  constructor(message, code = ANALYSIS_ERROR_CODES.INVALID_PLAN, options = {}) {
    super(message, code, options);
    this.name = 'PlanCompileError';
  }
}

export function compileAnalysisPlan(rawPlan, context) {
  const plan = parseAnalysisPlan(rawPlan);
  return compileParsedAnalysisPlan(plan, context);
}

export function compileParsedAnalysisPlan(plan, context) {
  try {
    return compileParsedAnalysisPlanImpl(plan, context);
  } catch (error) {
    if (error instanceof AnalysisCompileError) {
      throw new PlanCompileError(error.message, error.code, { kind: error.kind });
    }
    throw error;
  }
}

function compileParsedAnalysisPlanImpl(plan, context) {
  if (plan.mode !== 'analysis') {
    return {
      mode: plan.mode,
      title: plan.title,
      message: plan.clarifyingQuestion || plan.title || 'This request needs clarification.',
    };
  }
  if (!context?.hasDataset) throw new AnalysisCompileError('Open a CSV or Parquet file first.', ANALYSIS_ERROR_CODES.NO_DATASET, { kind: 'error' });

  const columns = contextColumnMap(context);
  const select = [];
  const groupBy = [];
  const aliases = new Set();

  for (const dimension of plan.dimensions) {
    const column = columns.get(dimension.column);
    if (!column) throw new AnalysisCompileError(`Column "${dimension.column}" does not exist.`, ANALYSIS_ERROR_CODES.COLUMN_NOT_FOUND);
    const expr = dimensionExpression(column, dimension.timeBucket);
    select.push(`${expr} AS ${quoteIdentifier(dimension.alias)}`);
    groupBy.push(expr);
    aliases.add(dimension.alias);
  }

  for (const metric of plan.metrics) {
    const expr = legacyMetricExpression(metric, columns);
    select.push(`${expr} AS ${quoteIdentifier(metric.alias)}`);
    aliases.add(metric.alias);
  }

  if (!select.length) throw new AnalysisCompileError('The analysis plan selected no fields.', ANALYSIS_ERROR_CODES.EMPTY_SELECTION);
  validateChartFields(plan.chart, aliases);

  const { sql: where, params } = compileFilterList(plan.filters, columns);
  const defaultOrder = plan.dimensions?.length && plan.metrics?.length
    ? [{ field: plan.metrics[0].alias, direction: 'desc' }]
    : [];
  const orderBy = orderBySql(plan.orderBy?.length ? plan.orderBy : defaultOrder, aliases);
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
    params,
    chart: plan.chart,
    aliases: [...aliases],
    limit,
  };
}

export { columnMap, escapeLike };
