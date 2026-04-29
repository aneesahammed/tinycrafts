import { z } from 'zod';

export const ANALYSIS_CATALOG_VERSION = '2026-04-29';

export const IdentifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const ColumnNameSchema = z.string().min(1).max(256);

export const FilterSchema = z.object({
  column: ColumnNameSchema,
  op: z.enum(['=', '!=', '<', '<=', '>', '>=', 'between', 'in', 'contains', 'is_null', 'is_not_null']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
}).strict();

export const AggregateMetricSchema = z.object({
  agg: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max']),
  column: ColumnNameSchema.nullable(),
  alias: IdentifierSchema,
}).strict();

export const DimensionSchema = z.object({
  column: ColumnNameSchema,
  alias: IdentifierSchema,
  timeBucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).nullable(),
}).strict();

export const AnalysisStepSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('profile_overview'),
    id: IdentifierSchema,
    title: z.string().max(80),
  }).strict(),
  z.object({
    tool: z.literal('missingness'),
    id: IdentifierSchema,
    title: z.string().max(80),
    columns: z.array(ColumnNameSchema).max(100),
  }).strict(),
  z.object({
    tool: z.literal('top_n'),
    id: IdentifierSchema,
    title: z.string().max(80),
    dimension: ColumnNameSchema,
    metric: AggregateMetricSchema,
    filters: z.array(FilterSchema).max(12),
    n: z.number().int().min(1).max(100).default(10),
    direction: z.enum(['asc', 'desc']),
  }).strict(),
  z.object({
    tool: z.literal('aggregate_query'),
    id: IdentifierSchema,
    title: z.string().max(80),
    dimensions: z.array(DimensionSchema).max(3),
    metrics: z.array(AggregateMetricSchema).max(8),
    filters: z.array(FilterSchema).max(12),
    orderBy: z.array(z.object({
      field: IdentifierSchema,
      direction: z.enum(['asc', 'desc']),
    }).strict()).max(3),
    limit: z.number().int().min(1).max(1000),
  }).strict(),
  z.object({
    tool: z.literal('histogram'),
    id: IdentifierSchema,
    title: z.string().max(80),
    column: ColumnNameSchema,
    bins: z.number().int().min(2).max(50).default(20),
    filters: z.array(FilterSchema).max(12),
  }).strict(),
  z.object({
    tool: z.literal('trend'),
    id: IdentifierSchema,
    title: z.string().max(80),
    timeColumn: ColumnNameSchema,
    bucket: z.enum(['day', 'week', 'month', 'quarter', 'year']),
    metric: AggregateMetricSchema,
    filters: z.array(FilterSchema).max(12),
    limit: z.number().int().min(1).max(1000).default(1000),
  }).strict(),
  z.object({
    tool: z.literal('outliers'),
    id: IdentifierSchema,
    title: z.string().max(80),
    column: ColumnNameSchema,
    method: z.literal('iqr'),
    filters: z.array(FilterSchema).max(12),
    limit: z.number().int().min(1).max(50).default(20),
  }).strict(),
  z.object({
    tool: z.literal('correlation'),
    id: IdentifierSchema,
    title: z.string().max(80),
    columns: z.array(ColumnNameSchema).min(2).max(8),
    method: z.literal('pearson'),
    filters: z.array(FilterSchema).max(12),
  }).strict(),
]);

export const AnalysisToolPlanSchema = z.object({
  schemaVersion: z.literal(1),
  catalogVersion: z.literal(ANALYSIS_CATALOG_VERSION),
  mode: z.enum(['analysis', 'clarify', 'unsupported']),
  title: z.string().max(120),
  steps: z.array(AnalysisStepSchema).min(1).max(3),
  clarifyingQuestion: z.string().nullable(),
}).strict();

export const ANALYSIS_TOOL_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'catalogVersion', 'mode', 'title', 'steps', 'clarifyingQuestion'],
  properties: {
    schemaVersion: { const: 1 },
    catalogVersion: { const: ANALYSIS_CATALOG_VERSION },
    mode: { type: 'string', enum: ['analysis', 'clarify', 'unsupported'] },
    title: { type: 'string', maxLength: 120 },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        anyOf: [
          objectSchema(['tool', 'id', 'title'], {
            tool: { const: 'profile_overview' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
          }),
          objectSchema(['tool', 'id', 'title', 'columns'], {
            tool: { const: 'missingness' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            columns: { type: 'array', maxItems: 100, items: columnNameJson() },
          }),
          objectSchema(['tool', 'id', 'title', 'dimension', 'metric', 'filters', 'n', 'direction'], {
            tool: { const: 'top_n' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            dimension: columnNameJson(),
            metric: aggregateMetricJson(),
            filters: filtersJson(),
            n: { type: 'integer', minimum: 1, maximum: 100 },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          }),
          objectSchema(['tool', 'id', 'title', 'dimensions', 'metrics', 'filters', 'orderBy', 'limit'], {
            tool: { const: 'aggregate_query' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            dimensions: {
              type: 'array',
              maxItems: 3,
              items: objectSchema(['column', 'alias', 'timeBucket'], {
                column: columnNameJson(),
                alias: identifierJson(),
                timeBucket: { anyOf: [{ type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] }, { type: 'null' }] },
              }),
            },
            metrics: { type: 'array', maxItems: 8, items: aggregateMetricJson() },
            filters: filtersJson(),
            orderBy: {
              type: 'array',
              maxItems: 3,
              items: objectSchema(['field', 'direction'], {
                field: identifierJson(),
                direction: { type: 'string', enum: ['asc', 'desc'] },
              }),
            },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          }),
          objectSchema(['tool', 'id', 'title', 'column', 'bins', 'filters'], {
            tool: { const: 'histogram' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            column: columnNameJson(),
            bins: { type: 'integer', minimum: 2, maximum: 50 },
            filters: filtersJson(),
          }),
          objectSchema(['tool', 'id', 'title', 'timeColumn', 'bucket', 'metric', 'filters', 'limit'], {
            tool: { const: 'trend' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            timeColumn: columnNameJson(),
            bucket: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
            metric: aggregateMetricJson(),
            filters: filtersJson(),
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          }),
          objectSchema(['tool', 'id', 'title', 'column', 'method', 'filters', 'limit'], {
            tool: { const: 'outliers' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            column: columnNameJson(),
            method: { const: 'iqr' },
            filters: filtersJson(),
            limit: { type: 'integer', minimum: 1, maximum: 50 },
          }),
          objectSchema(['tool', 'id', 'title', 'columns', 'method', 'filters'], {
            tool: { const: 'correlation' },
            id: identifierJson(),
            title: { type: 'string', maxLength: 80 },
            columns: { type: 'array', minItems: 2, maxItems: 8, items: columnNameJson() },
            method: { const: 'pearson' },
            filters: filtersJson(),
          }),
        ],
      },
    },
    clarifyingQuestion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

// Anthropic's structured-output grammar compiler is sensitive to large nested
// anyOf schemas. Send Claude a compact envelope and keep the full Zod schema as
// the authoritative local validator before compilation.
export const ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'catalogVersion', 'mode', 'title', 'steps', 'clarifyingQuestion'],
  properties: {
    schemaVersion: { const: 1 },
    catalogVersion: { const: ANALYSIS_CATALOG_VERSION },
    mode: { type: 'string', enum: ['analysis', 'clarify', 'unsupported'] },
    title: { type: 'string' },
    clarifyingQuestion: { type: 'string' },
    steps: {
      type: 'array',
      items: anthropicStepJson(),
    },
  },
};

export function parseAnalysisToolPlan(value) {
  return AnalysisToolPlanSchema.parse(normalizeCompactPlan(value));
}

function identifierJson() {
  return { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' };
}

function columnNameJson() {
  return { type: 'string', minLength: 1, maxLength: 256 };
}

function objectSchema(required, properties) {
  return { type: 'object', additionalProperties: false, required, properties };
}

function aggregateMetricJson() {
  return objectSchema(['agg', 'column', 'alias'], {
    agg: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] },
    column: { anyOf: [columnNameJson(), { type: 'null' }] },
    alias: identifierJson(),
  });
}

function filtersJson() {
  return {
    type: 'array',
    maxItems: 12,
    items: objectSchema(['column', 'op', 'value'], {
      column: columnNameJson(),
      op: { type: 'string', enum: ['=', '!=', '<', '<=', '>', '>=', 'between', 'in', 'contains', 'is_null', 'is_not_null'] },
      value: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'null' },
          { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] } },
        ],
      },
    }),
  };
}

function anthropicStepJson() {
  return objectSchema(['tool', 'id', 'title'], {
    tool: {
      type: 'string',
      enum: [
        'profile_overview',
        'missingness',
        'top_n',
        'aggregate_query',
        'histogram',
        'trend',
        'outliers',
        'correlation',
      ],
    },
    id: identifierJson(),
    title: { type: 'string' },
    columns: { type: 'array', items: columnNameJson() },
    dimension: columnNameJson(),
    metric: anthropicAggregateMetricJson(),
    filters: anthropicFiltersJson(),
    n: { type: 'integer' },
    direction: { type: 'string', enum: ['asc', 'desc'] },
    dimensions: { type: 'array', items: anthropicDimensionJson() },
    metrics: { type: 'array', items: anthropicAggregateMetricJson() },
    orderBy: {
      type: 'array',
      items: objectSchema(['field', 'direction'], {
        field: identifierJson(),
        direction: { type: 'string', enum: ['asc', 'desc'] },
      }),
    },
    limit: { type: 'integer' },
    column: columnNameJson(),
    bins: { type: 'integer' },
    timeColumn: columnNameJson(),
    bucket: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
    method: { type: 'string', enum: ['iqr', 'pearson'] },
  });
}

function anthropicAggregateMetricJson() {
  return objectSchema(['agg', 'alias'], {
    agg: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] },
    column: { type: 'string' },
    alias: identifierJson(),
  });
}

function anthropicDimensionJson() {
  return objectSchema(['column', 'alias'], {
    column: columnNameJson(),
    alias: identifierJson(),
    timeBucket: { type: 'string', enum: ['', 'day', 'week', 'month', 'quarter', 'year'] },
  });
}

function anthropicFiltersJson() {
  return {
    type: 'array',
    items: objectSchema(['column', 'op'], {
      column: columnNameJson(),
      op: { type: 'string', enum: ['=', '!=', '<', '<=', '>', '>=', 'between', 'in', 'contains', 'is_null', 'is_not_null'] },
      value: {
        type: 'string',
      },
    }),
  };
}

function normalizeCompactPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return {
    ...value,
    steps: Array.isArray(value.steps) ? value.steps.map(normalizeCompactStep) : value.steps,
  };
}

function normalizeCompactStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
  const next = { ...step };
  if (next.metric) next.metric = normalizeCompactMetric(next.metric);
  if (Array.isArray(next.metrics)) next.metrics = next.metrics.map(normalizeCompactMetric);
  if (Array.isArray(next.dimensions)) next.dimensions = next.dimensions.map(normalizeCompactDimension);
  if (Array.isArray(next.filters)) next.filters = next.filters.map(normalizeCompactFilter);
  return next;
}

function normalizeCompactMetric(metric) {
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) return metric;
  if (!Object.prototype.hasOwnProperty.call(metric, 'column')) return { ...metric, column: null };
  if (typeof metric.column === 'string' && metric.column.trim() === '') return { ...metric, column: null };
  return metric;
}

function normalizeCompactDimension(dimension) {
  if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)) return dimension;
  if (!Object.prototype.hasOwnProperty.call(dimension, 'timeBucket')) return { ...dimension, timeBucket: null };
  if (dimension.timeBucket === '') return { ...dimension, timeBucket: null };
  return dimension;
}

function normalizeCompactFilter(filter) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return filter;
  if (!Object.prototype.hasOwnProperty.call(filter, 'value')) return { ...filter, value: null };
  return filter;
}
