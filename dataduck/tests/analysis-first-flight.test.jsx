import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import duckdb from '../node_modules/@duckdb/duckdb-wasm/dist/duckdb-node.cjs';
import anthropicTopProductsFixture from './fixtures/anthropic/top-products-tool-use.json';
import { runAnalysisToolPlan } from '../src/ai/analysis-engine/runner.js';
import {
  ANALYSIS_CATALOG_VERSION,
  ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
  parseAnalysisToolPlan,
} from '../src/ai/analysis-engine/tool-schema.js';
import { activeDatasetFingerprint } from '../src/ai/dataset-fingerprint.js';
import { callAnthropicJson } from '../src/ai/providers/anthropic.js';
import { AnalysisMessage } from '../src/assistant/AnalysisMessage.jsx';
import { arrowTableToObjects } from '../src/util/arrow.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
});

describe('analysis first-flight integration', () => {
  it('round-trips a recorded Anthropic tool_use plan through parse, DuckDB execution, and render', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'request-id': 'req_recorded_top_products' }),
      json: async () => anthropicTopProductsFixture,
    });

    const rawPlan = await callAnthropicJson({
      apiKey: 'sk-ant-test',
      messages: [{ role: 'user', content: 'top products by units' }],
      jsonSchema: ANTHROPIC_ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
      fetchImpl,
    });
    const plan = parseAnalysisToolPlan(rawPlan);

    expect(plan.steps[0]).toMatchObject({
      tool: 'top_n',
      filters: [],
    });

    const { state, context, fingerprint } = datasetContext();
    await withDuckDb(async ({ conn, queryFn }) => {
      await conn.query('CREATE TABLE active_file(product VARCHAR, units DOUBLE);');
      await conn.query("INSERT INTO active_file VALUES ('Tea', 12), ('Tea', 3), ('Ink', 8), ('Clay', 4);");

      const result = await runAnalysisToolPlan({
        plan,
        context,
        startFingerprint: fingerprint,
        getStoreState: () => state,
        queryFn,
        now: monotonicClock(),
      });

      expect(result.incomplete).toBe(false);
      expect(result.artifacts[0].sql).toContain('FROM active_file');
      expect(result.artifacts[0].rows).toEqual([
        { dimension_value: 'Tea', units: 15 },
        { dimension_value: 'Ink', units: 8 },
        { dimension_value: 'Clay', units: 4 },
      ]);

      const { container } = render(
        <AnalysisMessage
          analysis={{
            ...result,
            schemaVersion: 2,
            type: 'analysis_result',
            question: 'top products by units',
            artifacts: result.artifacts.map((artifact) => ({
              ...artifact,
              chart: { kind: 'table', x: null, series: [] },
            })),
            privacyNotice: 'local',
            datasetFingerprint: fingerprint,
          }}
          settings={{ providers: { groq: { apiKey: 'gsk_test' } } }}
          onOpenSql={vi.fn()}
          onCopySql={vi.fn()}
        />,
      );

      expect(container.textContent).toContain('Top products by units');
      expect(container.textContent).toContain('Tea');
      expect(container.textContent).toContain('15');
    });
  });
});

function render(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function datasetContext() {
  const state = {
    activeTable: 'orders',
    files: new Map([['orders', {
      virtualName: 'orders.csv',
      size: 100,
      format: 'csv',
      profile: {
        schema: [
          { column_name: 'product', column_type: 'VARCHAR' },
          { column_name: 'units', column_type: 'DOUBLE' },
        ],
      },
    }]]),
  };
  const fingerprint = activeDatasetFingerprint(state);
  return {
    state,
    fingerprint,
    context: {
      hasDataset: true,
      fingerprint,
      columns: [
        { name: 'product', type: 'VARCHAR', rowCount: 4 },
        { name: 'units', type: 'DOUBLE', rowCount: 4 },
      ],
    },
  };
}

async function withDuckDb(fn) {
  const restore = patchDuckDbNodeWorkerLoading();
  let db = null;
  let conn = null;
  try {
    const distPath = path.resolve(process.cwd(), 'node_modules/@duckdb/duckdb-wasm/dist');
    const workerUrl = pathToFileURL(path.join(distPath, 'duckdb-node-mvp.worker.cjs')).href;
    const wasmPath = path.join(distPath, 'duckdb-mvp.wasm');
    const worker = await duckdb.createWorker(workerUrl);
    db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
    await db.instantiate(wasmPath);
    conn = await db.connect();

    await fn({
      conn,
      queryFn: async (sql, params = []) => {
        const statement = await conn.prepare(sql);
        try {
          const table = await statement.query(...params);
          return arrowTableToObjects(table);
        } finally {
          await statement.close().catch(() => undefined);
        }
      },
    });
  } finally {
    if (conn) await conn.close().catch(() => undefined);
    if (db) await db.terminate().catch(() => undefined);
    restore();
  }
}

function patchDuckDbNodeWorkerLoading() {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('file://') && url.endsWith('.worker.cjs')) {
      return { blob: async () => ({ __duckDbWorkerUrl: url }) };
    }
    return originalFetch(input, init);
  };
  URL.createObjectURL = (blob) => blob?.__duckDbWorkerUrl || originalCreateObjectURL(blob);
  return () => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
  };
}

function monotonicClock() {
  let now = 0;
  return () => {
    now += 7;
    return now;
  };
}
