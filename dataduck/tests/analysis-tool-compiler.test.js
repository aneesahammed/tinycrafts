import { describe, expect, it } from 'vitest';
import { compileToolPlan } from '../src/ai/analysis-engine/compiler.js';
import { ANALYSIS_CATALOG_VERSION } from '../src/ai/analysis-engine/tool-schema.js';

const context = {
  hasDataset: true,
  columns: [
    { name: 'product', type: 'VARCHAR', rowCount: 3, nullCount: 0 },
    { name: 'units', type: 'INTEGER', rowCount: 3, nullCount: 0 },
    { name: 'price', type: 'DOUBLE', rowCount: 3, nullCount: 0 },
    { name: 'created_at', type: 'TIMESTAMP', rowCount: 3, nullCount: 0 },
  ],
};

function plan(step) {
  return {
    schemaVersion: 1,
    catalogVersion: ANALYSIS_CATALOG_VERSION,
    mode: 'analysis',
    title: step.title,
    steps: [step],
    clarifyingQuestion: null,
  };
}

describe('analysis tool compiler', () => {
  it('compiles top_n with parameters and active_file only', () => {
    const compiled = compileToolPlan(plan({
      tool: 'top_n',
      id: 'top_products',
      title: 'Top products',
      dimension: 'product',
      metric: { agg: 'sum', column: 'units', alias: 'units' },
      filters: [{ column: 'product', op: 'contains', value: 'a%b' }],
      n: 5,
      direction: 'desc',
    }), context);

    expect(compiled.jobs[0].sql).toContain('FROM active_file');
    expect(compiled.jobs[0].sql).not.toContain('a%b');
    expect(compiled.jobs[0].params).toEqual(['%a\\%b%']);
  });

  it('compiles deterministic histogram, trend, outlier, and correlation tools', () => {
    const steps = [
      { tool: 'histogram', id: 'hist', title: 'Histogram', column: 'units', bins: 12, filters: [] },
      { tool: 'trend', id: 'trend', title: 'Trend', timeColumn: 'created_at', bucket: 'month', metric: { agg: 'sum', column: 'units', alias: 'units' }, filters: [], limit: 100 },
      { tool: 'outliers', id: 'outliers', title: 'Outliers', column: 'price', method: 'iqr', filters: [], limit: 10 },
      { tool: 'correlation', id: 'corr', title: 'Correlation', columns: ['units', 'price'], method: 'pearson', filters: [] },
    ];
    for (const step of steps) {
      const job = compileToolPlan(plan(step), context).jobs[0];
      expect(job.sql).toContain('active_file');
      expect(job.tool).toBe(step.tool);
    }
  });

  it('rejects trend over non-temporal and numeric tools over varchar', () => {
    expect(() => compileToolPlan(plan({
      tool: 'trend',
      id: 'bad_trend',
      title: 'Bad trend',
      timeColumn: 'product',
      bucket: 'month',
      metric: { agg: 'sum', column: 'units', alias: 'units' },
      filters: [],
      limit: 100,
    }), context)).toThrow();

    expect(() => compileToolPlan(plan({
      tool: 'histogram',
      id: 'bad_hist',
      title: 'Bad histogram',
      column: 'product',
      bins: 20,
      filters: [],
    }), context)).toThrow();
  });
});
