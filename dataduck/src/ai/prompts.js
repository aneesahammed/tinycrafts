export function buildPlannerMessages({ question, context }) {
  return [
    {
      role: 'system',
      content: [
        'You are DataDuck Analyst, a planner for a browser-local DuckDB-WASM data tool.',
        'Return only the requested JSON object. Do not return SQL.',
        'The application supports exactly one active table named active_file.',
        'Use only columns listed in the dataset context.',
        'If a requested calculation requires missing columns, ambiguous numeric casts, joins, or source rows, return mode "clarify" or "unsupported".',
        'For chartable grouped results, include orderBy and limit.',
        'Prefer aggregate answers over SELECT *.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        question,
        dataset: context,
      }),
    },
  ];
}
