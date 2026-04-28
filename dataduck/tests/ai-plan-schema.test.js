import { describe, expect, it } from 'vitest';
import { parseAnalysisPlan } from '../src/ai/plan-schema.js';

const validPlan = {
  mode: 'analysis',
  title: 'Top products',
  dimensions: [{ column: 'product', alias: 'product', timeBucket: null }],
  metrics: [{ kind: 'aggregate', agg: 'sum', column: 'units', alias: 'units' }],
  filters: [],
  orderBy: [{ field: 'units', direction: 'desc' }],
  limit: 10,
  chart: { kind: 'bar', x: 'product', series: [{ field: 'units', label: 'Units', mark: 'bar', axis: 'left' }] },
  clarifyingQuestion: null,
};

describe('analysis plan schema', () => {
  it('accepts analysis, combo chart, clarify, and unsupported plans', () => {
    expect(parseAnalysisPlan(validPlan).mode).toBe('analysis');
    expect(parseAnalysisPlan({
      ...validPlan,
      chart: {
        kind: 'combo',
        x: 'product',
        series: [
          { field: 'units', label: 'Units', mark: 'bar', axis: 'left' },
          { field: 'revenue', label: 'Revenue', mark: 'line', axis: 'right' },
        ],
      },
      metrics: [
        ...validPlan.metrics,
        { kind: 'aggregate', agg: 'sum', column: 'revenue', alias: 'revenue' },
      ],
      orderBy: [{ field: 'revenue', direction: 'desc' }],
    }).chart.kind).toBe('combo');
    expect(parseAnalysisPlan({ ...validPlan, mode: 'clarify', clarifyingQuestion: 'Which column?' }).mode).toBe('clarify');
    expect(parseAnalysisPlan({ ...validPlan, mode: 'unsupported', clarifyingQuestion: 'Joins are not supported.' }).mode).toBe('unsupported');
  });

  it('rejects unknown fields and extra properties', () => {
    expect(() => parseAnalysisPlan({
      ...validPlan,
      metrics: [{ kind: 'aggregate', agg: 'median', column: 'units', alias: 'units' }],
    })).toThrow();
    expect(() => parseAnalysisPlan({ ...validPlan, rawSql: 'SELECT * FROM active_file' })).toThrow();
  });
});
