import { describe, expect, it, vi } from 'vitest';
import { createLazyAiAssistant } from '../src/assistant/lazy.js';

function createStore() {
  const listeners = [];
  const state = { activeTable: null, files: new Map(), rightPanel: null };
  return {
    state,
    subscribe(listener) {
      listeners.push(listener);
      return () => {};
    },
    setRightPanel(panel) {
      state.rightPanel = panel;
      listeners.forEach((listener) => listener(state));
    },
  };
}

describe('lazy assistant loader', () => {
  it('opens a loading panel before importing the React assistant island', async () => {
    const stage = document.createElement('div');
    stage.className = 'stage';
    const store = createStore();
    const assistant = createLazyAiAssistant(stage, store, {
      query: vi.fn(),
      setSql: vi.fn(),
      showToast: vi.fn(),
    });

    const loading = assistant.open();
    expect(store.state.rightPanel).toMatchObject({ type: 'assistant' });
    expect(stage.textContent).toContain('Loading assistant');
    await loading;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stage.textContent).toContain('Ask DataDuck');
    assistant.destroy();
  });
});
