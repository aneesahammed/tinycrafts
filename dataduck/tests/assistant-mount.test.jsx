import { describe, expect, it, vi } from 'vitest';
import { mountAiAssistant } from '../src/assistant/mount.jsx';

function createStore() {
  const listeners = [];
  const state = {
    activeTable: null,
    files: new Map(),
    rightPanel: null,
  };
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

describe('assistant mount', () => {
  it('opens through the existing right panel host', () => {
    const stage = document.createElement('div');
    stage.className = 'stage';
    const store = createStore();

    const assistant = mountAiAssistant(stage, store, {
      query: vi.fn(),
      setSql: vi.fn(),
      showToast: vi.fn(),
    });
    assistant.open();

    expect(store.state.rightPanel).toMatchObject({ type: 'assistant' });
    expect(stage.dataset.rightOpen).toBe('true');
    expect(stage.querySelector('.right-panel').getAttribute('aria-label')).toBe('Data assistant');

    assistant.destroy();
  });

  it('closes the shared right panel host when toggled off', () => {
    const stage = document.createElement('div');
    stage.className = 'stage';
    const store = createStore();

    const assistant = mountAiAssistant(stage, store, {
      query: vi.fn(),
      setSql: vi.fn(),
      showToast: vi.fn(),
    });

    assistant.open();
    assistant.close();

    const host = stage.querySelector('.right-panel');
    expect(store.state.rightPanel).toBeNull();
    expect(stage.dataset.rightOpen).toBeUndefined();
    expect(host.hidden).toBe(true);
    expect(host.classList.contains('assistant-host')).toBe(false);

    assistant.destroy();
  });
});
