import { z } from 'zod';

export const ANALYSIS_CATALOG_VERSION = '2026-04-29';

export const IdentifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const ColumnNameSchema = z.string().min(1).max(256);
export const FILTER_OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'between', 'in', 'contains', 'is_null', 'is_not_null'];
export const AGGREGATES = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'];
export const TIME_BUCKETS = ['day', 'week', 'month', 'quarter', 'year'];
export const ANALYSIS_TOOLS = [
  'profile_overview',
  'missingness',
  'top_n',
  'aggregate_query',
  'histogram',
  'trend',
  'outliers',
  'correlation',
];
export const FilterOpSchema = z.enum(FILTER_OPERATORS);
export const AggregateOpSchema = z.enum(AGGREGATES);
export const TimeBucketSchema = z.enum(TIME_BUCKETS);

export const FilterSchema = z.object({
  column: ColumnNameSchema,
  op: FilterOpSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
}).strict();

export const AggregateMetricSchema = z.object({
  agg: AggregateOpSchema,
  column: ColumnNameSchema.nullable(),
  alias: IdentifierSchema,
}).strict();

export const DimensionSchema = z.object({
  column: ColumnNameSchema,
  alias: IdentifierSchema,
  timeBucket: TimeBucketSchema.nullable(),
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
    bucket: TimeBucketSchema,
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

// Anthropic's structured-output grammar compiler is sensitive to large nested
// union schemas. This provider-facing grammar is intentionally compact, but it
// is still defined in Zod and converted to JSON Schema so it cannot drift by hand.
export const AnthropicAggregateMetricSchema = z.object({
  agg: AggregateOpSchema,
  column: ColumnNameSchema.optional(),
  alias: IdentifierSchema,
}).strict();

export const AnthropicDimensionSchema = z.object({
  column: ColumnNameSchema,
  alias: IdentifierSchema,
  timeBucket: z.enum(['', ...TIME_BUCKETS]).optional(),
}).strict();

export const AnthropicFilterSchema = z.object({
  column: ColumnNameSchema,
  op: FilterOpSchema,
  value: z.string().optional(),
}).strict();

export const AnthropicOrderBySchema = z.object({
  field: IdentifierSchema,
  direction: z.enum(['asc', 'desc']),
}).strict();

export const AnthropicAnalysisStepSchema = z.object({
  tool: z.enum(ANALYSIS_TOOLS),
  id: IdentifierSchema,
  title: z.string(),
  columns: z.array(ColumnNameSchema).optional(),
  dimension: ColumnNameSchema.optional(),
  metric: AnthropicAggregateMetricSchema.optional(),
  filters: z.array(AnthropicFilterSchema).optional(),
  n: z.number().int().optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  dimensions: z.array(AnthropicDimensionSchema).optional(),
  metrics: z.array(AnthropicAggregateMetricSchema).optional(),
  orderBy: z.array(AnthropicOrderBySchema).optional(),
  limit: z.number().int().optional(),
  column: ColumnNameSchema.optional(),
  bins: z.number().int().optional(),
  timeColumn: ColumnNameSchema.optional(),
  bucket: TimeBucketSchema.optional(),
  method: z.enum(['iqr', 'pearson']).optional(),
}).strict();

export const AnthropicAnalysisToolPlanSchema = z.object({
  schemaVersion: z.literal(1),
  catalogVersion: z.literal(ANALYSIS_CATALOG_VERSION),
  mode: z.enum(['analysis', 'clarify', 'unsupported']),
  title: z.string(),
  steps: z.array(AnthropicAnalysisStepSchema),
  clarifyingQuestion: z.string(),
}).strict();

export const ANALYSIS_TOOL_PLAN_JSON_SCHEMA = providerJsonSchema(AnalysisToolPlanSchema);
export const ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA = providerJsonSchema(AnthropicAnalysisToolPlanSchema);

export function parseAnalysisToolPlan(value) {
  return AnalysisToolPlanSchema.parse(normalizeCompactPlan(value));
}

function providerJsonSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
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
  // The Anthropic compact schema only marks tool/id/title as required per step,
  // so Claude legitimately omits other fields when their values are empty. Fill
  // the safe defaults here, before strict Zod parsing rejects them.
  return applyCompactStepDefaults(next);
}

function applyCompactStepDefaults(step) {
  const tool = step.tool;
  const next = { ...step };
  // Tools that always carry a filter list — default to [] when omitted.
  if (
    tool === 'aggregate_query' ||
    tool === 'top_n' ||
    tool === 'histogram' ||
    tool === 'trend' ||
    tool === 'outliers' ||
    tool === 'correlation'
  ) {
    if (!Array.isArray(next.filters)) next.filters = [];
  }
  if (tool === 'aggregate_query') {
    if (!Array.isArray(next.orderBy)) next.orderBy = [];
    if (!Array.isArray(next.dimensions)) next.dimensions = [];
    if (!Array.isArray(next.metrics)) next.metrics = [];
    if (typeof next.limit !== 'number') next.limit = 1000;
  }
  if (tool === 'trend') {
    if (typeof next.limit !== 'number') next.limit = 1000;
    if (!next.bucket) next.bucket = 'month';
  }
  if (tool === 'top_n') {
    if (next.direction !== 'asc' && next.direction !== 'desc') next.direction = 'desc';
  }
  if (tool === 'outliers' && !next.method) next.method = 'iqr';
  if (tool === 'correlation' && !next.method) next.method = 'pearson';
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
