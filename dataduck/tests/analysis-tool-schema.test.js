import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ANALYSIS_CATALOG_VERSION,
  ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
  ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
  AnthropicAnalysisToolPlanSchema,
  AnalysisToolPlanSchema,
  parseAnalysisToolPlan,
} from '../src/ai/analysis-engine/tool-schema.js';

function base(overrides = {}) {
  return {
    schemaVersion: 1,
    catalogVersion: ANALYSIS_CATALOG_VERSION,
    mode: 'analysis',
    title: 'Top products',
    steps: [{
      tool: 'top_n',
      id: 'top_products',
      title: 'Top products',
      dimension: 'product',
      metric: { agg: 'sum', column: 'units', alias: 'units' },
      filters: [],
      n: 10,
      direction: 'desc',
    }],
    clarifyingQuestion: null,
    ...overrides,
  };
}

describe('analysis tool plan schema', () => {
  it('accepts the supported tool shapes', () => {
    const tools = [
      { tool: 'profile_overview', id: 'profile', title: 'Profile' },
      { tool: 'missingness', id: 'missing', title: 'Missingness', columns: ['product'] },
      { tool: 'histogram', id: 'hist', title: 'Distribution', column: 'units', bins: 20, filters: [] },
      { tool: 'trend', id: 'trend', title: 'Trend', timeColumn: 'created_at', bucket: 'month', metric: { agg: 'sum', column: 'units', alias: 'units' }, filters: [], limit: 100 },
      { tool: 'outliers', id: 'outliers', title: 'Outliers', column: 'units', method: 'iqr', filters: [], limit: 20 },
      { tool: 'correlation', id: 'corr', title: 'Correlation', columns: ['units', 'price'], method: 'pearson', filters: [] },
      { tool: 'aggregate_query', id: 'agg', title: 'Aggregate', dimensions: [], metrics: [{ agg: 'count', column: null, alias: 'rows' }], filters: [], orderBy: [], limit: 100 },
    ];
    for (const step of tools) {
      expect(parseAnalysisToolPlan(base({ steps: [step] })).steps[0].tool).toBe(step.tool);
    }
  });

  it('rejects extra fields, unknown tools, and too many steps', () => {
    expect(() => parseAnalysisToolPlan(base({ extra: true }))).toThrow();
    expect(() => parseAnalysisToolPlan(base({ steps: [{ tool: 'sql', id: 'bad', title: 'Bad' }] }))).toThrow();
    expect(() => parseAnalysisToolPlan(base({
      steps: [
        { tool: 'profile_overview', id: 'a', title: 'A' },
        { tool: 'profile_overview', id: 'b', title: 'B' },
        { tool: 'profile_overview', id: 'c', title: 'C' },
        { tool: 'profile_overview', id: 'd', title: 'D' },
      ],
    }))).toThrow();
  });

  it('supports clarify and unsupported modes with the same envelope', () => {
    expect(parseAnalysisToolPlan(base({
      mode: 'clarify',
      title: 'Pick a column',
      steps: [{ tool: 'profile_overview', id: 'context', title: 'Context' }],
      clarifyingQuestion: 'Which column should I use?',
    })).mode).toBe('clarify');
  });

  it('normalizes compact Anthropic nullable fields before strict validation', () => {
    const plan = parseAnalysisToolPlan(base({
      steps: [{
        tool: 'aggregate_query',
        id: 'orders',
        title: 'Orders',
        dimensions: [{ column: 'order_date', alias: 'order_date', timeBucket: '' }],
        metrics: [{ agg: 'count', column: '', alias: 'rows' }],
        filters: [],
        orderBy: [],
        limit: 100,
      }],
      clarifyingQuestion: '',
    }));

    expect(plan.steps[0].dimensions[0].timeBucket).toBeNull();
    expect(plan.steps[0].metrics[0].column).toBeNull();
  });

  it('derives provider JSON schemas from the authoritative Zod schemas', () => {
    expect(ANALYSIS_TOOL_PLAN_JSON_SCHEMA).toEqual(providerJsonSchema(AnalysisToolPlanSchema));
    expect(ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA).toEqual(providerJsonSchema(AnthropicAnalysisToolPlanSchema));
  });

  it('normalizes compact Anthropic plans that omit empty optional tool fields', () => {
    const plan = parseAnalysisToolPlan(base({
      steps: [{
        tool: 'top_n',
        id: 'top_products',
        title: 'Top products',
        dimension: 'product',
        metric: { agg: 'sum', column: 'units', alias: 'units' },
        n: 5,
        direction: 'desc',
      }],
      clarifyingQuestion: '',
    }));

    expect(plan.steps[0].filters).toEqual([]);
  });
});

function providerJsonSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
