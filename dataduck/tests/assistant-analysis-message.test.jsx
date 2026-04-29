import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisMessage } from '../src/assistant/AnalysisMessage.jsx';
import { selectChartRows } from '../src/assistant/ChartCard.jsx';
import { normalizeChartRows } from '../src/assistant/normalize-chart-data.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe('assistant analysis rendering', () => {
  it('previews every sanitized aggregate row that confirmation will upload', () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ product: `row-${index}`, units: index }));
    const { container, root } = render(
      <AnalysisMessage
        analysis={{
          title: 'Rows',
          privacyNotice: 'local',
          elapsedMs: 1,
          sql: 'SELECT 1',
          question: 'show rows',
          columns: ['product', 'units'],
          rows,
          chart: { kind: 'table', x: null, series: [] },
        }}
        settings={{ apiKey: 'gsk_test' }}
        onOpenSql={vi.fn()}
        onCopySql={vi.fn()}
      />,
    );

    act(() => {
      container.querySelector('.analysis-aggregate-trigger').click();
    });

    expect(container.textContent).toContain('row-0');
    expect(container.textContent).toContain('row-6');
    act(() => {
      root.unmount();
    });
  });

  it('caps chart rows before rendering high-cardinality results', () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ product: `p-${index}`, units: index }));
    const selected = selectChartRows(rows);

    expect(selected.rows).toHaveLength(120);
    expect(selected.truncated).toBe(true);
  });

  it('samples time-series chart rows across the full range instead of hiding the latest rows', () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ order_date: `d-${index}`, units: index }));
    const selected = selectChartRows(rows, 120, {
      chart: { kind: 'line', x: 'order_date' },
      xType: 'Date64<MILLISECOND>',
    });

    expect(selected.rows).toHaveLength(120);
    expect(selected.truncated).toBe(true);
    expect(selected.rows[0].order_date).toBe('d-0');
    expect(selected.rows.at(-1).order_date).toBe('d-499');
  });

  it('normalizes chart rows with temporal column metadata', () => {
    expect(normalizeChartRows(
      [{ order_date: 1735776000000, total_amount: '11567.59' }],
      ['order_date', 'total_amount'],
      { order_date: 'Date32<DAY>' },
    )).toEqual([{ order_date: '2025-01-02', total_amount: 11567.59 }]);
  });

  it('normalizes BigInt and non-finite numeric chart values safely', () => {
    expect(normalizeChartRows(
      [{ a: 10n, b: Number.NaN, c: Number.POSITIVE_INFINITY, d: -0 }],
      ['a', 'b', 'c', 'd'],
      {},
    )).toEqual([{ a: 10, b: null, c: null, d: 0 }]);
  });

  it('labels metadata-only planning without implying aggregate rows were sent', () => {
    const { container, root } = render(
      <AnalysisMessage
        analysis={{
          title: 'Rows',
          privacyNotice: 'local',
          elapsedMs: 1,
          sql: 'SELECT 1',
          question: 'show rows',
          columns: ['order_date'],
          columnTypes: { order_date: 'Date32<DAY>' },
          rows: [{ order_date: 1735776000000 }],
          chart: { kind: 'table', x: null, series: [] },
        }}
        settings={{ apiKey: 'gsk_test' }}
        onOpenSql={vi.fn()}
        onCopySql={vi.fn()}
      />,
    );

    expect(container.textContent).toContain('Metadata-only planning');
    expect(container.textContent).not.toContain('Schema-only context');
    expect(container.textContent).toContain('2025-01-02');
    act(() => {
      root.unmount();
    });
  });

  it('aborts aggregate summary requests when unmounted', async () => {
    let capturedSignal = null;
    const summaryProvider = vi.fn(({ abortSignal }) => {
      capturedSignal = abortSignal;
      return new Promise(() => {});
    });
    const { container, root } = render(
      <AnalysisMessage
        analysis={{
          title: 'Rows',
          privacyNotice: 'local',
          elapsedMs: 1,
          sql: 'SELECT 1',
          question: 'show rows',
          columns: ['product'],
          rows: [{ product: 'row-0' }],
          chart: { kind: 'table', x: null, series: [] },
        }}
        settings={{ apiKey: 'gsk_test' }}
        summaryProvider={summaryProvider}
        onOpenSql={vi.fn()}
        onCopySql={vi.fn()}
      />,
    );

    act(() => {
      container.querySelector('.analysis-aggregate-trigger').click();
    });
    await act(async () => {
      container.querySelector('.analysis-preview button').click();
    });

    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);

    act(() => {
      root.unmount();
    });

    expect(capturedSignal.aborted).toBe(true);
  });
});
