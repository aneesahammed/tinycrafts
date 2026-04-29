import { query as duckdbQuery } from '../duckdb/engine.js';
import { buildDatasetContext } from './context.js';
import { activeDatasetFingerprint } from './dataset-fingerprint.js';
import { callProviderJson } from './providers/registry.js';
import { compileParsedAnalysisPlan, PlanCompileError } from './query-compiler.js';
import { parseAnalysisPlan, ANALYSIS_PLAN_JSON_SCHEMA } from './plan-schema.js';
import { buildPlannerMessages, buildPlannerPrompt } from './prompts.js';
import { AI_LIMITS } from './privacy.js';
import {
  formatNumber,
  inferDisplayColumnTypes,
  isTemporalColumnType,
  valueToDisplay,
} from '../util/format.js';

export async function answerDataQuestion({
  question,
  storeState,
  settings = {},
  getStoreState = () => storeState,
  queryFn = duckdbQuery,
  planProvider = null,
  fetchImpl = fetch,
  abortSignal = null,
  now = () => Date.now(),
} = {}) {
  const context = buildDatasetContext(storeState);
  if (!context.hasDataset) {
    return systemAnswer({
      mode: 'clarify',
      title: 'Open a file first',
      text: 'Open a CSV or Parquet file before asking for analysis.',
    });
  }

  const startFingerprint = context.fingerprint;
  const plannerPrompt = buildPlannerPrompt({ question, context });
  const messages = buildPlannerMessages({ question, context });
  const rawPlan = planProvider
    ? await planProvider({ question, context, messages, plannerPrompt, abortSignal })
    : await callProviderJson({
        settings,
        messages,
        plannerPrompt,
        jsonSchema: ANALYSIS_PLAN_JSON_SCHEMA,
        maxCompletionTokens: AI_LIMITS.maxCompletionTokens,
        abortSignal,
        fetchImpl,
      });

  assertFresh(startFingerprint, getStoreState());
  const plan = parseAnalysisPlan(rawPlan);
  if (plan.mode === 'clarify' || plan.mode === 'unsupported') {
    return systemAnswer({
      mode: plan.mode,
      title: plan.title,
      text: plan.clarifyingQuestion || plan.title,
      plan,
      context,
    });
  }

  let compiled;
  try {
    compiled = compileParsedAnalysisPlan(plan, context);
  } catch (error) {
    if (error instanceof PlanCompileError && error.code === 'CLARIFY') {
      return systemAnswer({
        mode: 'clarify',
        title: 'Clarification needed',
        text: error.message,
        plan,
        context,
      });
    }
    throw error;
  }

  const startedAt = now();
  const result = await queryFn(compiled.sql);
  assertFresh(startFingerprint, getStoreState());
  const elapsedMs = Math.max(0, Math.round(now() - startedAt));
  const columns = result.columns || [];
  const rows = result.rows || [];
  const columnTypes = inferDisplayColumnTypes(columns, rows, result.columnTypes || {});
  const typedResult = { ...result, columns, rows, columnTypes };

  const answer = {
    type: 'analysis_result',
    mode: 'analysis',
    title: compiled.title,
    question: String(question || ''),
    text: summarizeResult(compiled, typedResult),
    sql: compiled.sql,
    columns,
    columnTypes,
    rows,
    elapsedMs,
    chart: compiled.chart,
    privacyNotice: 'Planned with schema/profile metadata only. Query execution stayed in DuckDB-WASM.',
    datasetFingerprint: startFingerprint,
  };

  return {
    mode: 'analysis',
    title: compiled.title,
    text: answer.text,
    content: [
      { type: 'text', text: answer.text },
      { type: 'data', name: 'analysis_result', data: answer },
    ],
    analysis: answer,
  };
}

function systemAnswer({ mode, title, text, plan = null, context = null }) {
  return {
    mode,
    title,
    text,
    plan,
    context,
    content: [{ type: 'text', text }],
    analysis: null,
  };
}

function summarizeResult(compiled, result) {
  const rows = result.rows || [];
  if (!rows.length) return `${compiled.title}: no rows matched.`;
  const first = rows[0] || {};
  const firstSeries = compiled.chart?.series?.[0];
  const firstSeriesField = firstSeries?.field;
  const x = compiled.chart?.x;
  const columnTypes = result.columnTypes || {};
  if (x && firstSeriesField && first[x] != null && first[firstSeriesField] != null) {
    if (isTemporalColumnType(columnTypes[x])) {
      return summarizeTimeSeries({ compiled, result, x, series: firstSeries });
    }
    return `${compiled.title}: the top result is ${formatSummaryValue(first[x], columnTypes[x])} with ${formatSummaryValue(first[firstSeriesField], columnTypes[firstSeriesField])}.`;
  }
  return `${compiled.title}: returned ${rows.length} row${rows.length === 1 ? '' : 's'}.`;
}

function summarizeTimeSeries({ compiled, result, x, series }) {
  const rows = result.rows || [];
  const y = series.field;
  const columnTypes = result.columnTypes || {};
  const first = rows[0] || {};
  const last = rows[rows.length - 1] || {};
  const peak = rows.reduce((best, row) => {
    const value = toFiniteNumber(row?.[y]);
    if (value == null) return best;
    return best == null || value > best.value ? { row, value } : best;
  }, null);

  const label = series.label || y;
  const range = `${formatSummaryValue(first[x], columnTypes[x])} to ${formatSummaryValue(last[x], columnTypes[x])}`;
  const latest = formatSummaryValue(last[y], columnTypes[y]);
  if (!peak) return `${compiled.title}: ${label} runs from ${range}; latest is ${latest}.`;

  return `${compiled.title}: ${label} runs from ${range}; peak is ${formatSummaryValue(peak.row[y], columnTypes[y])} on ${formatSummaryValue(peak.row[x], columnTypes[x])}; latest is ${latest}.`;
}

function formatSummaryValue(value, columnType = null) {
  if (isTemporalColumnType(columnType)) return valueToDisplay(value, columnType);
  if (typeof value === 'number' || typeof value === 'bigint') return formatNumber(value);
  return valueToDisplay(value, columnType);
}

function toFiniteNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function assertFresh(startFingerprint, state) {
  if (activeDatasetFingerprint(state) !== startFingerprint) {
    const error = new Error('The active file changed before analysis completed. Ask again for the current file.');
    error.code = 'STALE_DATASET';
    throw error;
  }
}
