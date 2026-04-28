import { describe, expect, it } from 'vitest';
import { answerDataQuestion } from '../src/ai/analyst.js';

function stateFor(table = 'orders') {
  return {
    activeTable: table,
    files: new Map([
      [table, {
        virtualName: `${table}.parquet`,
        size: 100,
        format: 'parquet',
        summaryStatus: 'ready',
        summary: new Map([
          ['product', { rowCount: 2 }],
          ['units', { rowCount: 2, min: 1, max: 10 }],
        ]),
        profile: {
          schema: [
            { column_name: 'product', column_type: 'VARCHAR' },
            { column_name: 'units', column_type: 'INTEGER' },
          ],
        },
      }],
    ]),
  };
}

const plan = {
  mode: 'analysis',
  title: 'Top products',
  dimensions: [{ column: 'product', alias: 'product', timeBucket: null }],
  metrics: [{ kind: 'aggregate', agg: 'sum', column: 'units', alias: 'units' }],
  filters: [],
  orderBy: [{ field: 'units', direction: 'desc' }],
  limit: 5,
  chart: { kind: 'bar', x: 'product', series: [{ field: 'units', label: 'Units', mark: 'bar', axis: 'left' }] },
  clarifyingQuestion: null,
};

describe('AI analyst orchestration', () => {
  it('plans, compiles, runs DuckDB locally, and returns analysis content', async () => {
    const answer = await answerDataQuestion({
      question: 'top products',
      storeState: stateFor(),
      settings: { apiKey: 'test' },
      planProvider: async () => plan,
      queryFn: async () => ({ columns: ['product', 'units'], rows: [{ product: 'A', units: 10 }] }),
      now: () => 10,
    });

    expect(answer.mode).toBe('analysis');
    expect(answer.content.some((part) => part.type === 'data' && part.name === 'analysis_result')).toBe(true);
    expect(answer.analysis.sql).toContain('FROM active_file');
  });

  it('rejects stale active-file changes', async () => {
    const original = stateFor('orders');
    const changed = stateFor('customers');
    await expect(answerDataQuestion({
      question: 'top products',
      storeState: original,
      getStoreState: () => changed,
      settings: { apiKey: 'test' },
      planProvider: async () => plan,
      queryFn: async () => ({ columns: [], rows: [] }),
    })).rejects.toMatchObject({ code: 'STALE_DATASET' });
  });
});
