import { z } from 'zod';

// Keep schema validation compatible with CSP Trusted Types enforcement.
// Zod's object-schema JIT probes Function(''), which Chrome reports as a
// TrustedScript violation even when Zod catches it.
z.config({ jitless: true });

export const IdentifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const DimensionSchema = z.object({
  column: z.string().min(1),
  alias: IdentifierSchema,
  timeBucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).nullable(),
}).strict();

export const MetricSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('aggregate'),
    agg: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max']),
    column: z.string().min(1).nullable(),
    alias: IdentifierSchema,
  }).strict(),
  z.object({
    kind: z.literal('sum_product'),
    leftColumn: z.string().min(1),
    rightColumn: z.string().min(1),
    alias: IdentifierSchema,
  }).strict(),
]);

export const FilterSchema = z.object({
  column: z.string().min(1),
  op: z.enum(['=', '!=', '<', '<=', '>', '>=', 'between', 'in', 'contains', 'is_null', 'is_not_null']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
}).strict();

export const ChartSchema = z.object({
  kind: z.enum(['table', 'bar', 'line', 'scatter', 'histogram', 'combo']),
  x: IdentifierSchema.nullable(),
  series: z.array(z.object({
    field: IdentifierSchema,
    label: z.string().min(1),
    mark: z.enum(['bar', 'line', 'point']),
    axis: z.enum(['left', 'right']),
  }).strict()).max(6),
}).strict();

export const AnalysisPlanSchema = z.object({
  mode: z.enum(['analysis', 'clarify', 'unsupported']),
  title: z.string().max(120),
  dimensions: z.array(DimensionSchema).max(3),
  metrics: z.array(MetricSchema).max(8),
  filters: z.array(FilterSchema).max(12),
  orderBy: z.array(z.object({
    field: IdentifierSchema,
    direction: z.enum(['asc', 'desc']),
  }).strict()).max(3),
  limit: z.number().int().min(1).max(1000),
  chart: ChartSchema,
  clarifyingQuestion: z.string().nullable(),
}).strict();

export const ANALYSIS_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode',
    'title',
    'dimensions',
    'metrics',
    'filters',
    'orderBy',
    'limit',
    'chart',
    'clarifyingQuestion',
  ],
  properties: {
    mode: { type: 'string', enum: ['analysis', 'clarify', 'unsupported'] },
    title: { type: 'string', maxLength: 120 },
    dimensions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['column', 'alias', 'timeBucket'],
        properties: {
          column: { type: 'string', minLength: 1 },
          alias: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
          timeBucket: { anyOf: [{ type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] }, { type: 'null' }] },
        },
      },
    },
    metrics: {
      type: 'array',
      maxItems: 8,
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'agg', 'column', 'alias'],
            properties: {
              kind: { const: 'aggregate' },
              agg: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] },
              column: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
              alias: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'leftColumn', 'rightColumn', 'alias'],
            properties: {
              kind: { const: 'sum_product' },
              leftColumn: { type: 'string', minLength: 1 },
              rightColumn: { type: 'string', minLength: 1 },
              alias: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
            },
          },
        ],
      },
    },
    filters: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['column', 'op', 'value'],
        properties: {
          column: { type: 'string', minLength: 1 },
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
        },
      },
    },
    orderBy: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'direction'],
        properties: {
          field: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
          direction: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    limit: { type: 'integer', minimum: 1, maximum: 1000 },
    chart: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'x', 'series'],
      properties: {
        kind: { type: 'string', enum: ['table', 'bar', 'line', 'scatter', 'histogram', 'combo'] },
        x: { anyOf: [{ type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, { type: 'null' }] },
        series: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'label', 'mark', 'axis'],
            properties: {
              field: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
              label: { type: 'string', minLength: 1 },
              mark: { type: 'string', enum: ['bar', 'line', 'point'] },
              axis: { type: 'string', enum: ['left', 'right'] },
            },
          },
        },
      },
    },
    clarifyingQuestion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export function parseAnalysisPlan(value) {
  return AnalysisPlanSchema.parse(value);
}
