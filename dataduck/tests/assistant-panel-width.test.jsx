import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/ai/analyst.js', () => ({
  answerDataQuestion: vi.fn(),
}));

vi.mock('../src/ai/secure-key-store.js', () => ({
  clearProviderKey: vi.fn(),
  loadProviderKey: vi.fn(async () => ''),
  migrateLegacyGroqKey: vi.fn(async () => ({ status: 'none' })),
  saveProviderKey: vi.fn(),
  secureKeyStoreSupported: vi.fn(() => false),
}));

const { AssistantApp } = await import('../src/assistant/AssistantApp.jsx');

function createStore() {
  const listeners = new Set();
  const state = {
    activeTable: 'orders',
    files: new Map([
      [
        'orders',
        {
          profile: {
            schema: [
              { column_name: 'order_date', column_type: 'DATE' },
              { column_name: 'region', column_type: 'VARCHAR' },
              { column_name: 'total_amount', column_type: 'DOUBLE' },
            ],
          },
          summary: new Map(),
        },
      ],
    ]),
    rightPanel: { type: 'assistant' },
  };
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('AssistantApp panel width', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has no width toggle: the panel is resized from its edge like the rail', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<AssistantApp store={createStore()} queryFn={vi.fn()} />);
    });

    const panel = container.querySelector('.assistant-panel');
    expect(panel.dataset.panelSize).toBeUndefined();
    expect(container.querySelector('[aria-label="Expand panel width"]')).toBeNull();
    expect(container.querySelector('[aria-label="Use compact panel width"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
