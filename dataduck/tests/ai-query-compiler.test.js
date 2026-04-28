import { describe, expect, it } from 'vitest';
import {
  compileAnalysisPlan,
  compileParsedAnalysisPlan,
  escapeLike,
  PlanCompileError,
} from '../src/ai/query-compiler.js';

const context = {
  hasDataset: true,
  columns: [
    { name: 'product', type: 'VARCHAR' },
    { name: 'units', type: 'INTEGER' },
    { name: 'price', type: 'DOUBLE' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ],
};

function basePlan(overrides = {}) {
  return {
    mode: 'analysis',
    title: 'Top products',
    dimensions: [{ column: 'product', alias: 'product', timeBucket: null }],
    metrics: [{ kind: 'aggregate', agg: 'sum', column: 'units', alias: 'units' }],
    filters: [],
    orderBy: [{ field: 'units', direction: 'desc' }],
    limit: 5,
    chart: { kind: 'bar', x: 'product', series: [{ field: 'units', label: 'Units', mark: 'bar', axis: 'left' }] },
    clarifyingQuestion: null,
    ...overrides,
  };
}

describe('AI query compiler', () => {
  it('compiles top-N aggregate plans against active_file', () => {
    const compiled = compileAnalysisPlan(basePlan(), context);

    expect(compiled.sql).toContain('FROM active_file');
    expect(compiled.sql).toContain('SUM("units") AS "units"');
    expect(compiled.sql).toContain('GROUP BY "product"');
    expect(compiled.sql).toContain('ORDER BY "units" DESC');
    expect(compiled.sql).toContain('LIMIT 5;');
  });

  it('compiles an already-validated plan without requiring another parse pass', () => {
    const compiled = compileParsedAnalysisPlan(basePlan(), context);

    expect(compiled.sql).toContain('FROM active_file');
    expect(compiled.title).toBe('Top products');
  });

  it('escapes contains wildcards', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    const compiled = compileAnalysisPlan(basePlan({
      filters: [{ column: 'product', op: 'contains', value: 'a%b' }],
    }), context);
    expect(compiled.sql).toContain("ILIKE '%a\\%b%' ESCAPE '\\'");
  });

  it('rejects numeric metrics over varchar columns', () => {
    expect(() => compileAnalysisPlan(basePlan({
      metrics: [{ kind: 'aggregate', agg: 'sum', column: 'product', alias: 'bad_sum' }],
      chart: { kind: 'bar', x: 'product', series: [{ field: 'bad_sum', label: 'Bad', mark: 'bar', axis: 'left' }] },
      orderBy: [{ field: 'bad_sum', direction: 'desc' }],
    }), context)).toThrow(PlanCompileError);
  });

  it('compiles sum_product only for numeric columns', () => {
    const compiled = compileAnalysisPlan(basePlan({
      metrics: [{ kind: 'sum_product', leftColumn: 'units', rightColumn: 'price', alias: 'revenue' }],
      chart: { kind: 'bar', x: 'product', series: [{ field: 'revenue', label: 'Revenue', mark: 'bar', axis: 'left' }] },
      orderBy: [{ field: 'revenue', direction: 'desc' }],
    }), context);
    expect(compiled.sql).toContain('SUM(CAST("units" AS DOUBLE) * CAST("price" AS DOUBLE)) AS "revenue"');
  });

  it('rejects filters whose literal types do not match the column type', () => {
    expect(() => compileAnalysisPlan(basePlan({
      filters: [{ column: 'units', op: '>', value: 'ten' }],
    }), context)).toThrow(PlanCompileError);
    expect(() => compileAnalysisPlan(basePlan({
      filters: [{ column: 'product', op: '>', value: 'A' }],
    }), context)).toThrow(PlanCompileError);
    expect(() => compileAnalysisPlan(basePlan({
      filters: [{ column: 'created_at', op: 'between', value: [1, 2] }],
    }), context)).toThrow(PlanCompileError);
    expect(() => compileAnalysisPlan(basePlan({
      filters: [{ column: 'product', op: 'contains', value: null }],
    }), context)).toThrow(PlanCompileError);
  });
});
