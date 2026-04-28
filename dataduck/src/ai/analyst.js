import { query as duckdbQuery } from '../duckdb/engine.js';
import { buildDatasetContext } from './context.js';
import { activeDatasetFingerprint } from './dataset-fingerprint.js';
import { callGroqJson } from './groq-client.js';
import { compileParsedAnalysisPlan, PlanCompileError } from './query-compiler.js';
import { parseAnalysisPlan, ANALYSIS_PLAN_JSON_SCHEMA } from './plan-schema.js';
import { buildPlannerMessages } from './prompts.js';
import { DEFAULT_GROQ_MODEL, GROQ_LIMITS } from './privacy.js';

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
  const messages = buildPlannerMessages({ question, context });
  const rawPlan = planProvider
    ? await planProvider({ question, context, messages, abortSignal })
    : await callGroqJson({
        apiKey: settings.apiKey,
        model: settings.model || DEFAULT_GROQ_MODEL,
        messages,
        jsonSchema: ANALYSIS_PLAN_JSON_SCHEMA,
        maxCompletionTokens: GROQ_LIMITS.maxCompletionTokens,
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

  const answer = {
    type: 'analysis_result',
    mode: 'analysis',
    title: compiled.title,
    question: String(question || ''),
    text: summarizeResult(compiled, result),
    sql: compiled.sql,
    columns: result.columns || [],
    rows: result.rows || [],
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
  const firstSeries = compiled.chart?.series?.[0]?.field;
  const x = compiled.chart?.x;
  if (x && firstSeries && first[x] != null && first[firstSeries] != null) {
    return `${compiled.title}: the leading result is ${first[x]} with ${first[firstSeries]}.`;
  }
  return `${compiled.title}: returned ${rows.length} row${rows.length === 1 ? '' : 's'}.`;
}

function assertFresh(startFingerprint, state) {
  if (activeDatasetFingerprint(state) !== startFingerprint) {
    const error = new Error('The active file changed before analysis completed. Ask again for the current file.');
    error.code = 'STALE_DATASET';
    throw error;
  }
}
