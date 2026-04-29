import { ANALYSIS_CATALOG_VERSION } from './tool-schema.js';

export const TOOL_CATALOG = [
  {
    tool: 'profile_overview',
    description: 'Summarize data health, column types, row counts, null coverage, and numeric/temporal ranges from local profile metadata.',
  },
  {
    tool: 'missingness',
    description: 'Rank selected columns by null count and null percentage. Use when the user asks about missing data or data quality.',
  },
  {
    tool: 'top_n',
    description: 'Group by one dimension and calculate one aggregate metric. Default n is 10; ties sort by metric then dimension.',
  },
  {
    tool: 'aggregate_query',
    description: 'General single-table aggregate over dimensions, metrics, filters, ordering, and limit. No joins and no raw SQL.',
  },
  {
    tool: 'histogram',
    description: 'Fixed-width numeric or temporal distribution with 20 bins by default and 50 bins maximum.',
  },
  {
    tool: 'trend',
    description: 'Temporal bucketed aggregate over a real DuckDB date/time/timestamp column only.',
  },
  {
    tool: 'outliers',
    description: 'Tukey IQR outlier scan for one numeric column.',
  },
  {
    tool: 'correlation',
    description: 'Pearson correlation for 2 to 8 numeric columns, pairwise null exclusion.',
  },
];

export function toolCatalogForPrompt(availableTools = null) {
  const allowed = availableTools ? new Set(availableTools) : null;
  return {
    catalogVersion: ANALYSIS_CATALOG_VERSION,
    tools: TOOL_CATALOG.filter((tool) => !allowed || allowed.has(tool.tool)),
  };
}
