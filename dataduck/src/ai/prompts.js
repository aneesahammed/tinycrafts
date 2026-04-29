export function buildPlannerMessages({ question, context }) {
  const prompt = buildPlannerPrompt({ question, context });
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
      }),
    },
  ];
}

export function buildPlannerPrompt({ question, context }) {
  return {
    system: PLANNER_SYSTEM_PROMPT,
    question: String(question || ''),
    dataset: promptDatasetContext(context),
  };
}

const PLANNER_SYSTEM_PROMPT = [
  'You are DataDuck Analyst, a planner for a browser-local DuckDB-WASM data tool.',
  'Return only the requested JSON object. Do not return SQL.',
  'The application supports exactly one active table named active_file.',
  'Use only columns listed in the dataset context.',
  'If a requested calculation requires missing columns, ambiguous numeric casts, joins, or source rows, return mode "clarify" or "unsupported".',
  'For chartable grouped results, include orderBy and limit.',
  'Prefer aggregate answers over SELECT *.',
].join('\n');

export function promptDatasetContext(context = {}) {
  return {
    hasDataset: Boolean(context.hasDataset),
    table: 'active_file',
    summaryStatus: context.summaryStatus || 'missing',
    columns: (context.columns || []).map((column) => {
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
    }),
  };
}
