import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedSignal = null;
let resolveAnswer = null;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/ai/analyst.js', () => ({
  answerDataQuestion: vi.fn(({ abortSignal }) => {
    capturedSignal = abortSignal;
    return new Promise((resolve) => {
      resolveAnswer = resolve;
    });
  }),
}));

vi.mock('../src/ai/secure-key-store.js', () => ({
  clearLegacyGroqKey: vi.fn(),
  clearProviderKey: vi.fn(),
  loadProviderKey: vi.fn(async (providerId) => (providerId === 'groq' ? 'gsk_test' : '')),
  migrateLegacyGroqKey: vi.fn(async () => ({ status: 'none' })),
  saveProviderKey: vi.fn(),
  secureKeyStoreSupported: vi.fn(() => true),
}));

const { AssistantApp } = await import('../src/assistant/AssistantApp.jsx');

function createStore() {
  const listeners = new Set();
  const state = {
    activeTable: 'orders',
    files: new Map([['orders', { profile: { schema: [] }, summary: new Map() }]]),
    rightPanel: { type: 'assistant' },
  };
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRightPanel(panel) {
      state.rightPanel = panel;
      listeners.forEach((listener) => listener(state));
    },
  };
}

function inputValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('AssistantApp request lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dataduck-ai-settings', JSON.stringify({
      providerId: 'groq',
      rememberKey: true,
      providers: { groq: { model: 'openai/gpt-oss-120b' } },
    }));
    capturedSignal = null;
    resolveAnswer = null;
  });

  it('aborts the visible assistant request on unmount and skips stale persistence', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<AssistantApp store={createStore()} queryFn={vi.fn()} />);
    });

    await act(async () => {
      inputValue(container.querySelector('textarea'), 'top products');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);

    await act(async () => {
      root.unmount();
    });

    expect(capturedSignal.aborted).toBe(true);

    await act(async () => {
      resolveAnswer?.({ text: 'late answer', analysis: null });
    });
    expect(container.textContent).not.toContain('late answer');
  });

  it('aborts the active request when switching providers', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<AssistantApp store={createStore()} queryFn={vi.fn()} />);
    });
    await act(async () => {
      inputValue(container.querySelector('textarea'), 'top products');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);

    await act(async () => {
      container.querySelector('[aria-label="AI settings"]').click();
    });
    await act(async () => {
      inputValue(container.querySelector('select'), 'anthropic');
    });

    expect(capturedSignal.aborted).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
