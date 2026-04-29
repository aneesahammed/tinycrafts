import { toolCatalogForPrompt } from './analysis-engine/tool-catalog.js';
import { buildPlanMemory, selectPromptColumns } from './analysis-engine/conversation-memory.js';

export const PROMPT_CONTEXT_LIMITS = {
  maxColumns: 120,
  maxSelectedColumns: 40,
  maxSerializedChars: 24_000,
};

export function buildPlannerMessages({ question, context, thread = null }) {
  const prompt = buildPlannerPrompt({ question, context, thread });
  return [
    {
      role: 'system',
      content: prompt.system,
    },
    {
      role: 'user',
      content: JSON.stringify({
        question: prompt.question,
        dataset: prompt.dataset,
        toolCatalog: prompt.toolCatalog,
        planMemory: prompt.planMemory,
      }),
    },
  ];
}

export function buildPlannerPrompt({ question, context, thread = null }) {
  const dataset = promptDatasetContext(context, { question });
  return {
    system: PLANNER_SYSTEM_PROMPT,
    question: String(question || ''),
    dataset,
    toolCatalog: toolCatalogForPrompt(),
    planMemory: buildPlanMemory({
      thread,
      currentFingerprint: context?.fingerprint,
      promptColumns: dataset.columns || [],
    }),
  };
}

const PLANNER_SYSTEM_PROMPT = [
  'You are DataDuck Analyst, a planner for a browser-local DuckDB-WASM data tool.',
  'Return only the requested JSON object. Do not return SQL.',
  'The application supports exactly one active table named active_file.',
  'Use only columns listed in the dataset context.',
  'Choose one to three independent tool steps; steps cannot reference each other.',
  'If a requested calculation requires missing columns, ambiguous numeric casts, joins, source rows, or dependent multi-step state, return mode "clarify" or "unsupported".',
  'Set clarifyingQuestion to an empty string when no clarification is needed.',
  'Use schemaVersion 1 and the exact catalogVersion from the tool catalog.',
  'For varchar numeric-looking columns, ask for clarification instead of casting.',
  'Prefer deterministic aggregate answers over raw row listing.',
].join('\n');

export function promptDatasetContext(context = {}, { question = '', limits = PROMPT_CONTEXT_LIMITS } = {}) {
  const selected = selectPromptColumns({
    question,
    columns: context.columns || [],
    maxColumns: limits.maxColumns,
    maxSelected: limits.maxSelectedColumns,
  });
  const dataset = {
    hasDataset: Boolean(context.hasDataset),
    table: 'active_file',
    summaryStatus: context.summaryStatus || 'missing',
    columnCount: (context.columns || []).length,
    omittedColumnCount: selected.omitted || 0,
    narrowedColumns: Boolean(selected.narrowed),
    needsColumnClarification: Boolean(selected.needsClarification),
    columns: selected.columns.map(safePromptColumn),
  };
  return trimDatasetContext(dataset, limits.maxSerializedChars);
}

function safePromptColumn(column) {
  const safe = {
    name: String(column.name || ''),
    type: String(column.type || ''),
    rowCount: column.rowCount ?? null,
    nullCount: column.nullCount ?? null,
    nullPercentage: column.nullPercentage ?? null,
    distinct: column.distinct ?? null,
  };
  if (Object.prototype.hasOwnProperty.call(column, 'min')) safe.min = column.min;
  if (Object.prototype.hasOwnProperty.call(column, 'max')) safe.max = column.max;
  return safe;
}

function trimDatasetContext(dataset, maxChars) {
  const next = { ...dataset, columns: [...dataset.columns] };
  while (JSON.stringify(next).length > maxChars && next.columns.length) {
    next.columns.pop();
    next.omittedColumnCount += 1;
    next.narrowedColumns = true;
  }
  if (!next.columns.length && dataset.columns.length) next.needsColumnClarification = true;
  return next;
}
