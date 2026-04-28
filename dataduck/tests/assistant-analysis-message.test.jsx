import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisMessage } from '../src/assistant/AnalysisMessage.jsx';
import { selectChartRows } from '../src/assistant/ChartCard.jsx';

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
      container.querySelector('.assistant-aggregate > button').click();
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
});
