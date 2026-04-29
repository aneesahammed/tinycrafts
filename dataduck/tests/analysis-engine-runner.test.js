import { describe, expect, it, vi } from 'vitest';
import { runAnalysisToolPlan } from '../src/ai/analysis-engine/runner.js';
import { ANALYSIS_CATALOG_VERSION } from '../src/ai/analysis-engine/tool-schema.js';
import { activeDatasetFingerprint } from '../src/ai/dataset-fingerprint.js';

const state = {
  activeTable: 'orders',
  files: new Map([['orders', {
    virtualName: 'orders.csv',
    size: 10,
    format: 'csv',
    profile: { schema: [{ column_name: 'product', column_type: 'VARCHAR' }, { column_name: 'units', column_type: 'INTEGER' }] },
  }]]),
};
const fingerprint = activeDatasetFingerprint(state);
const context = {
  hasDataset: true,
  fingerprint,
  columns: [
    { name: 'product', type: 'VARCHAR', rowCount: 2 },
    { name: 'units', type: 'INTEGER', rowCount: 2 },
  ],
};

function plan(steps) {
  return {
    schemaVersion: 1,
    catalogVersion: ANALYSIS_CATALOG_VERSION,
    mode: 'analysis',
    title: 'Analysis',
    steps,
    clarifyingQuestion: null,
  };
}

describe('analysis engine runner', () => {
  it('executes a compiled tool with prepared params and returns artifacts', async () => {
    const queryFn = vi.fn(async () => ({ columns: ['dimension_value', 'units'], rows: [{ dimension_value: 'A', units: 10 }] }));
    const result = await runAnalysisToolPlan({
      plan: plan([{
        tool: 'top_n',
        id: 'top',
        title: 'Top',
        dimension: 'product',
        metric: { agg: 'sum', column: 'units', alias: 'units' },
        filters: [{ column: 'product', op: 'contains', value: 'A' }],
        n: 10,
        direction: 'desc',
      }]),
      context,
      startFingerprint: fingerprint,
      getStoreState: () => state,
      queryFn,
    });

    expect(result.mode).toBe('analysis');
    expect(result.artifacts[0].rows[0].units).toBe(10);
    expect(queryFn.mock.calls[0][1]).toEqual(['%A%']);
  });

  it('returns a stale diagnostic and discards partial artifacts when the dataset changes', async () => {
    const result = await runAnalysisToolPlan({
      plan: plan([{ tool: 'profile_overview', id: 'profile', title: 'Profile' }]),
      context,
      startFingerprint: fingerprint,
      getStoreState: () => ({ activeTable: null, files: new Map() }),
      queryFn: vi.fn(),
    });

    expect(result.incomplete).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].status).toBe('stale');
  });

  it('turns step failures into sanitized diagnostic artifacts', async () => {
    const result = await runAnalysisToolPlan({
      plan: plan([{
        tool: 'top_n',
        id: 'bad',
        title: 'Bad',
        dimension: 'product',
        metric: { agg: 'sum', column: 'missing', alias: 'missing' },
        filters: [],
        n: 10,
        direction: 'desc',
      }]),
      context,
      startFingerprint: fingerprint,
      getStoreState: () => state,
      queryFn: vi.fn(),
    });

    expect(result.incomplete).toBe(true);
    expect(result.artifacts[0].status).toBe('unsupported');
    expect(result.artifacts[0].rows).toEqual([]);
  });
});
