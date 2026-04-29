import { z } from 'zod';

export const ANALYSIS_CATALOG_VERSION = '2026-04-29';
export const ANALYSIS_TOOL_SCHEMA_NAME = 'dataduck_analysis_tool_plan';

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

export const ANALYSIS_TOOL_PLAN_JSON_SCHEMA = providerJsonSchema(AnalysisToolPlanSchema);
export const ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA = deriveAnthropicToolPlanJsonSchema(ANALYSIS_TOOL_PLAN_JSON_SCHEMA);

export function parseAnalysisToolPlan(value) {
  return AnalysisToolPlanSchema.parse(normalizeCompactPlan(value));
}

function providerJsonSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}

// Anthropic's structured-output grammar compiler is sensitive to large nested
// union schemas. Derive the compact provider grammar from the strict JSON
// Schema so the provider contract cannot drift from the runtime validator.
export function deriveAnthropicToolPlanJsonSchema(strictSchema = ANALYSIS_TOOL_PLAN_JSON_SCHEMA) {
  const properties = strictSchema?.properties || {};
  const steps = compactArraySchema(properties.steps);
  return removeUndefined({
    type: 'object',
    properties: {
      schemaVersion: compactJsonSchema(properties.schemaVersion),
      catalogVersion: compactJsonSchema(properties.catalogVersion),
      mode: compactJsonSchema(properties.mode),
      title: compactJsonSchema(properties.title),
      steps: {
        ...steps,
        items: compactStepSchema(properties.steps?.items),
      },
      clarifyingQuestion: compactJsonSchema(properties.clarifyingQuestion),
    },
    required: ['schemaVersion', 'catalogVersion', 'mode', 'title', 'steps', 'clarifyingQuestion'],
    additionalProperties: false,
  });
}

function compactStepSchema(stepItemsSchema = {}) {
  const variants = stepItemsSchema.oneOf || stepItemsSchema.anyOf || [];
  const toolNames = [];
  const mergedProperties = {};
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant?.properties || {})) {
      const compact = compactJsonSchema(value);
      if (key === 'tool') {
        for (const name of schemaStringValues(compact)) toolNames.push(name);
        continue;
      }
      mergedProperties[key] = mergeCompactSchemas(mergedProperties[key], compact);
    }
  }
  return {
    type: 'object',
    properties: {
      tool: { type: 'string', enum: unique(toolNames.length ? toolNames : ANALYSIS_TOOLS) },
      ...mergedProperties,
    },
    required: ['tool', 'id', 'title'],
    additionalProperties: false,
  };
}

function compactJsonSchema(schema = {}) {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.anyOf || schema.oneOf) return compactUnionSchema(schema.anyOf || schema.oneOf);
  if (schema.type === 'object') return compactObjectSchema(schema);
  if (schema.type === 'array') return compactArraySchema(schema);
  return compactLeafSchema(schema);
}

function compactObjectSchema(schema) {
  const properties = {};
  for (const [key, value] of Object.entries(schema.properties || {})) {
    properties[key] = compactJsonSchema(value);
  }
  const required = (schema.required || [])
    .filter((key) => properties[key] && !isNullableSchema(schema.properties?.[key]));
  return removeUndefined({
    type: 'object',
    properties,
    required: required.length ? required : undefined,
    additionalProperties: false,
  });
}

function compactArraySchema(schema = {}) {
  return removeUndefined({
    type: 'array',
    minItems: schema.minItems,
    maxItems: schema.maxItems,
    items: compactJsonSchema(schema.items || {}),
  });
}

function compactUnionSchema(options = []) {
  const compactOptions = options
    .filter((option) => !isNullSchema(option))
    .map((option) => compactJsonSchema(option));
  if (compactOptions.length === 0) return { type: 'string' };
  return mergeManyCompactSchemas(compactOptions);
}

function compactLeafSchema(schema) {
  const next = {
    type: schema.const !== undefined ? inferJsonType(schema.const) : schema.type,
    const: schema.const,
    enum: schema.enum ? [...schema.enum] : undefined,
    minLength: schema.minLength,
    maxLength: schema.maxLength,
    pattern: schema.pattern,
    minimum: schema.minimum,
    maximum: schema.maximum,
    default: schema.default,
  };
  return removeUndefined(next);
}

function mergeManyCompactSchemas(schemas) {
  return schemas.reduce((merged, schema) => mergeCompactSchemas(merged, schema), undefined) || {};
}

function mergeCompactSchemas(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (stableJson(left) === stableJson(right)) return left;
  const leftValues = schemaStringValues(left);
  const rightValues = schemaStringValues(right);
  if ((leftValues.length || rightValues.length) && (left.type === 'string' || right.type === 'string')) {
    return { type: 'string', enum: unique([...leftValues, ...rightValues]) };
  }
  if (left.type === 'string' || right.type === 'string') return mergeStringSchemas(left.type === 'string' ? left : right);
  if (left.type === 'object' && right.type === 'object') return mergeObjectSchemas(left, right);
  if (left.type === 'array' && right.type === 'array') return mergeArraySchemas(left, right);
  if (left.type === 'integer' && right.type === 'integer') return mergeNumericSchemas(left, right, 'integer');
  if ((left.type === 'number' || left.type === 'integer') && (right.type === 'number' || right.type === 'integer')) {
    return mergeNumericSchemas(left, right, 'number');
  }
  return left;
}

function mergeStringSchemas(schema) {
  return removeUndefined({
    type: 'string',
    minLength: schema.minLength,
    maxLength: schema.maxLength,
    pattern: schema.pattern,
  });
}

function mergeObjectSchemas(left, right) {
  const properties = { ...(left.properties || {}) };
  for (const [key, value] of Object.entries(right.properties || {})) {
    properties[key] = mergeCompactSchemas(properties[key], value);
  }
  return removeUndefined({
    type: 'object',
    properties,
    required: unique([...(left.required || []), ...(right.required || [])]),
    additionalProperties: false,
  });
}

function mergeArraySchemas(left, right) {
  return removeUndefined({
    type: 'array',
    minItems: minimumOnlyWhenBothDefined(left.minItems, right.minItems),
    maxItems: maximumDefined(left.maxItems, right.maxItems),
    items: mergeCompactSchemas(left.items, right.items),
  });
}

function mergeNumericSchemas(left, right, type) {
  return removeUndefined({
    type,
    minimum: minimumDefined(left.minimum, right.minimum),
    maximum: maximumDefined(left.maximum, right.maximum),
    default: left.default ?? right.default,
  });
}

function schemaStringValues(schema) {
  if (!schema || schema.type !== 'string') return [];
  if (schema.const !== undefined) return [String(schema.const)];
  if (Array.isArray(schema.enum)) return schema.enum.map(String);
  return [];
}

function isNullableSchema(schema = {}) {
  return Boolean((schema.anyOf || schema.oneOf || []).some(isNullSchema));
}

function isNullSchema(schema = {}) {
  return schema?.type === 'null';
}

function inferJsonType(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return 'number';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function minimumDefined(left, right) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function maximumDefined(left, right) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

function minimumOnlyWhenBothDefined(left, right) {
  if (left === undefined || right === undefined) return undefined;
  return Math.min(left, right);
}

function unique(values) {
  return [...new Set(values)];
}

function stableJson(value) {
  return JSON.stringify(value);
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
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
