import { queryPrepared as duckdbQueryPrepared } from '../duckdb/engine.js';
import { buildDatasetContext } from './context.js';
import { callProviderJson } from './providers/registry.js';
import { parseAnalysisToolPlan, ANALYSIS_TOOL_PLAN_JSON_SCHEMA } from './analysis-engine/tool-schema.js';
import { buildPlannerMessages, buildPlannerPrompt } from './prompts.js';
import { AI_LIMITS } from './privacy.js';
import { runAnalysisToolPlan } from './analysis-engine/runner.js';
import { diagnosticArtifact } from './analysis-engine/artifacts.js';
import { safeAnalysisError } from './analysis-engine/errors.js';

export async function answerDataQuestion({
  question,
  storeState,
  settings = {},
  getStoreState = () => storeState,
  queryFn = duckdbQueryPrepared,
  planProvider = null,
  fetchImpl = fetch,
  abortSignal = null,
  now = () => Date.now(),
  thread = null,
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
  const plannerPrompt = buildPlannerPrompt({ question, context, thread });
  if (plannerPrompt.dataset?.needsColumnClarification) {
    return systemAnswer({
      mode: 'clarify',
      title: 'Choose columns',
      text: 'This file has too many columns to plan safely from the question alone. Ask about specific columns.',
      context,
    });
  }

  let plan;
  try {
    plan = await requestValidatedPlan({
      question,
      context,
      plannerPrompt,
      settings,
      planProvider,
      fetchImpl,
      abortSignal,
      thread,
    });
  } catch (error) {
    if (abortSignal?.aborted || error?.name === 'AbortError') throw error;
    const safe = safeAnalysisError(error);
    return diagnosticAnswer({
      title: 'Analysis plan failed',
      question,
      safe,
      datasetFingerprint: startFingerprint,
    });
  }

  if (plan.mode === 'clarify' || plan.mode === 'unsupported') {
    return systemAnswer({
      mode: plan.mode,
      title: plan.title,
      text: plan.clarifyingQuestion || plan.title,
      plan,
      context,
    });
  }

  const run = await runAnalysisToolPlan({
    plan,
    context,
    startFingerprint,
    getStoreState,
    queryFn,
    now,
  });
  if (run.mode === 'clarify' || run.mode === 'unsupported') {
    return systemAnswer({
      mode: run.mode,
      title: run.title,
      text: run.text,
      plan,
      context,
    });
  }
  return analysisAnswer({
    title: run.title,
    question,
    text: run.text,
    artifacts: run.artifacts,
    datasetFingerprint: startFingerprint,
    incomplete: run.incomplete,
  });
}

async function requestValidatedPlan({
  question,
  context,
  plannerPrompt,
  settings,
  planProvider,
  fetchImpl,
  abortSignal,
  thread,
}) {
  const messages = buildPlannerMessages({ question, context, thread });
  const rawPlan = planProvider
    ? await planProvider({ question, context, messages, plannerPrompt, abortSignal })
    : await callProviderJson({
        settings,
        messages,
        plannerPrompt,
        jsonSchema: ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
        schemaName: 'dataduck_analysis_tool_plan',
        maxCompletionTokens: AI_LIMITS.maxCompletionTokens,
        abortSignal,
        fetchImpl,
      });
  try {
    return parseProviderPlan(rawPlan);
  } catch (error) {
    if (planProvider) throw error;
    const retryMessages = [
      ...messages,
      {
        role: 'user',
        content: JSON.stringify({
          correction: 'The previous response failed schema validation. Return a valid DataDuck analysis tool plan only.',
          validationIssues: safeValidationIssues(error),
        }),
      },
    ];
    const retryPlan = await callProviderJson({
      settings,
      messages: retryMessages,
      plannerPrompt: { ...plannerPrompt, validationIssues: safeValidationIssues(error) },
      jsonSchema: ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
      schemaName: 'dataduck_analysis_tool_plan',
      maxCompletionTokens: AI_LIMITS.maxCompletionTokens,
      abortSignal,
      fetchImpl,
    });
    return parseProviderPlan(retryPlan);
  }
}

function parseProviderPlan(rawPlan) {
  try {
    return parseAnalysisToolPlan(rawPlan);
  } catch (error) {
    const legacy = legacyPlanToToolPlan(rawPlan);
    if (legacy) return parseAnalysisToolPlan(legacy);
    throw error;
  }
}

function legacyPlanToToolPlan(rawPlan) {
  if (!rawPlan || rawPlan.schemaVersion || !Array.isArray(rawPlan.metrics) || !Array.isArray(rawPlan.dimensions)) return null;
  if (rawPlan.mode === 'clarify' || rawPlan.mode === 'unsupported') {
    return {
      schemaVersion: 1,
      catalogVersion: '2026-04-29',
      mode: rawPlan.mode,
      title: rawPlan.title || rawPlan.mode,
      steps: [{
        tool: 'profile_overview',
        id: 'legacy_context',
        title: rawPlan.title || rawPlan.mode,
      }],
      clarifyingQuestion: rawPlan.clarifyingQuestion || rawPlan.title || null,
    };
  }
  return {
    schemaVersion: 1,
    catalogVersion: '2026-04-29',
    mode: 'analysis',
    title: rawPlan.title || 'Analysis',
    steps: [{
      tool: 'aggregate_query',
      id: 'legacy_aggregate',
      title: rawPlan.title || 'Analysis',
      dimensions: rawPlan.dimensions || [],
      metrics: (rawPlan.metrics || []).filter((metric) => metric.kind === 'aggregate').map((metric) => ({
        agg: metric.agg,
        column: metric.column,
        alias: metric.alias,
      })),
      filters: rawPlan.filters || [],
      orderBy: rawPlan.orderBy || [],
      limit: rawPlan.limit || 100,
    }],
    clarifyingQuestion: null,
  };
}

function analysisAnswer({ title, question, text, artifacts, datasetFingerprint, incomplete = false }) {
  const primary = artifacts.find((artifact) => artifact.status === 'ok') || artifacts[0] || null;
  const answer = {
    schemaVersion: 2,
    type: 'analysis_result',
    mode: incomplete ? 'incomplete' : 'analysis',
    title,
    question: String(question || ''),
    text,
    artifacts,
    primaryArtifactId: primary?.id || null,
    sql: primary?.sql || null,
    params: primary?.params || [],
    columns: primary?.columns || [],
    columnTypes: primary?.columnTypes || {},
    rows: primary?.rows || [],
    elapsedMs: primary?.elapsedMs || 0,
    chart: primary?.chart || { kind: 'table', x: null, series: [] },
    privacyNotice: 'Planned with schema/profile metadata only. Query execution stayed in DuckDB-WASM.',
    datasetFingerprint,
  };

  return {
    mode: incomplete ? 'incomplete' : 'analysis',
    title,
    text,
    content: [
      { type: 'text', text },
      { type: 'data', name: 'analysis_result', data: answer },
    ],
    analysis: answer,
  };
}

function diagnosticAnswer({ title, question, safe, datasetFingerprint }) {
  return analysisAnswer({
    title,
    question,
    text: safe.safeMessage,
    artifacts: [diagnosticArtifact({
      id: 'plan_diagnostic',
      status: 'error',
      code: safe.code,
      safeMessage: safe.safeMessage,
    })],
    datasetFingerprint,
    incomplete: true,
  });
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

function safeValidationIssues(error) {
  return (error?.issues || []).slice(0, 6).map((issue) => ({
    path: (issue.path || []).map(String).join('.'),
    code: issue.code,
    expected: issue.expected || '',
  }));
}
