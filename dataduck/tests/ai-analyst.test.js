import { describe, expect, it, vi } from 'vitest';
import { answerDataQuestion } from '../src/ai/analyst.js';
import { ANALYSIS_ERROR_CODES } from '../src/ai/analysis-engine/errors.js';

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

function salesState(table = 'sales') {
  return {
    activeTable: table,
    files: new Map([
      [table, {
        virtualName: `${table}.csv`,
        size: 100,
        format: 'csv',
        summaryStatus: 'ready',
        summary: new Map([
          ['order_date', { rowCount: 3, min: 1735776000000, max: 1735948800000 }],
          ['total_amount', { rowCount: 3, min: 12000, max: 40000 }],
        ]),
        profile: {
          schema: [
            { column_name: 'order_date', column_type: 'DATE' },
            { column_name: 'total_amount', column_type: 'DOUBLE' },
          ],
        },
      }],
    ]),
  };
}

function epochSalesState(table = 'sales') {
  return {
    activeTable: table,
    files: new Map([
      [table, {
        virtualName: `${table}.csv`,
        size: 100,
        format: 'csv',
        summaryStatus: 'ready',
        summary: new Map([
          ['order_date', { rowCount: 3, min: 1735776000000, max: 1766707200000 }],
          ['total_amount', { rowCount: 3, min: 2822.49, max: 110206.48 }],
        ]),
        profile: {
          schema: [
            { column_name: 'order_date', column_type: 'BIGINT' },
            { column_name: 'total_amount', column_type: 'DOUBLE' },
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

const timeSeriesPlan = {
  mode: 'analysis',
  title: 'Total Amount Over Order Date',
  dimensions: [{ column: 'order_date', alias: 'order_date', timeBucket: null }],
  metrics: [{ kind: 'aggregate', agg: 'sum', column: 'total_amount', alias: 'total_amount' }],
  filters: [],
  orderBy: [{ field: 'order_date', direction: 'asc' }],
  limit: 1000,
  chart: {
    kind: 'line',
    x: 'order_date',
    series: [{ field: 'total_amount', label: 'Total Amount', mark: 'line', axis: 'left' }],
  },
  clarifyingQuestion: null,
};

const epochTimeSeriesPlan = {
  ...timeSeriesPlan,
  metrics: [{ kind: 'aggregate', agg: 'sum', column: 'total_amount', alias: 'total_amount_sum' }],
  chart: {
    kind: 'line',
    x: 'order_date',
    series: [{ field: 'total_amount_sum', label: 'Total Amount', mark: 'line', axis: 'left' }],
  },
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

  it('returns a stale diagnostic when the active file changes', async () => {
    const original = stateFor('orders');
    const changed = stateFor('customers');
    const answer = await answerDataQuestion({
      question: 'top products',
      storeState: original,
      getStoreState: () => changed,
      settings: { apiKey: 'test' },
      planProvider: async () => plan,
      queryFn: async () => ({ columns: [], rows: [] }),
    });

    expect(answer.mode).toBe('incomplete');
    expect(answer.analysis.artifacts[0]).toMatchObject({ status: 'stale', code: 'STALE_DATASET' });
  });

  it('uses a dedicated diagnostic when the provider returns valid JSON with the wrong plan shape', async () => {
    const invalidPlanResponse = {
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: 'toolu_bad_shape',
        name: 'dataduck_analysis_tool_plan',
        input: {
          schemaVersion: 1,
          catalogVersion: '2026-04-29',
          mode: 'analysis',
          title: 'Bad top products',
          steps: [{ tool: 'top_n', id: 'bad_top', title: 'Bad top products' }],
          clarifyingQuestion: '',
        },
      }],
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'request-id': 'req_bad_shape' }),
      json: async () => invalidPlanResponse,
    });

    const answer = await answerDataQuestion({
      question: 'top products',
      storeState: stateFor(),
      settings: {
        providerId: 'anthropic',
        providers: { anthropic: { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6' } },
      },
      fetchImpl,
      queryFn: async () => ({ columns: [], rows: [] }),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(answer.mode).toBe('incomplete');
    expect(answer.analysis.artifacts[0]).toMatchObject({
      status: 'error',
      code: ANALYSIS_ERROR_CODES.LLM_INVALID_PLAN_SHAPE,
    });
  });

  it('summarizes temporal chart results by range, peak, and latest value', async () => {
    const answer = await answerDataQuestion({
      question: 'How does total_amount change over order_date?',
      storeState: salesState(),
      settings: { apiKey: 'test' },
      planProvider: async () => timeSeriesPlan,
      queryFn: async () => ({
        columns: ['order_date', 'total_amount'],
        columnTypes: { order_date: 'Date32<DAY>', total_amount: 'Float64' },
        rows: [
          { order_date: 1735776000000, total_amount: 20000 },
          { order_date: 1735862400000, total_amount: 40000 },
          { order_date: 1735948800000, total_amount: 12000 },
        ],
      }),
    });

    expect(answer.text).toBe(
      'Total Amount Over Order Date: Total Amount runs from 2025-01-02 to 2025-01-04; peak is 40,000 on 2025-01-03; latest is 12,000.',
    );
    expect(answer.analysis.columnTypes).toEqual({ order_date: 'Date32<DAY>', total_amount: 'Float64' });
  });

  it('treats numeric epoch-millisecond date dimensions as dates in assistant summaries', async () => {
    const answer = await answerDataQuestion({
      question: 'How does total_amount change over order_date?',
      storeState: epochSalesState(),
      settings: { apiKey: 'test' },
      planProvider: async () => epochTimeSeriesPlan,
      queryFn: async () => ({
        columns: ['order_date', 'total_amount_sum'],
        columnTypes: { order_date: 'Int64', total_amount_sum: 'Float64' },
        rows: [
          { order_date: 1735776000000, total_amount_sum: 11567.59 },
          { order_date: 1737504000000, total_amount_sum: 110206.48 },
          { order_date: 1766707200000, total_amount_sum: 2822.49 },
        ],
      }),
    });

    expect(answer.text).toBe(
      'Total Amount Over Order Date: Total Amount runs from 2025-01-02 to 2025-12-26; peak is 110,206.48 on 2025-01-22; latest is 2,822.49.',
    );
    expect(answer.analysis.columnTypes.order_date).toBe('Date64<MILLISECOND>');
  });
});
