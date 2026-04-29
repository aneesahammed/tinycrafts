import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const saveProviderKey = vi.fn();
const loadProviderKey = vi.fn(async () => '');
const clearProviderKey = vi.fn();
const migrateLegacyGroqKey = vi.fn(async () => ({ status: 'none' }));

vi.mock('../src/ai/analyst.js', () => ({
  answerDataQuestion: vi.fn(async () => ({ text: 'answer', analysis: null })),
}));

vi.mock('../src/ai/secure-key-store.js', () => ({
  clearProviderKey: (...args) => clearProviderKey(...args),
  loadProviderKey: (...args) => loadProviderKey(...args),
  migrateLegacyGroqKey: (...args) => migrateLegacyGroqKey(...args),
  saveProviderKey: (...args) => saveProviderKey(...args),
  secureKeyStoreSupported: vi.fn(() => true),
}));

const { AssistantApp } = await import('../src/assistant/AssistantApp.jsx');
const { answerDataQuestion } = await import('../src/ai/analyst.js');

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

async function renderAssistant(props = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<AssistantApp store={createStore()} queryFn={vi.fn()} {...props} />);
  });
  return { container, root };
}

describe('AssistantApp provider settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    loadProviderKey.mockResolvedValue('');
    migrateLegacyGroqKey.mockResolvedValue({ status: 'none' });
  });

  it('defaults first-time users to Claude provider settings', async () => {
    const { container, root } = await renderAssistant();

    await act(async () => {
      container.querySelector('[aria-label="AI settings"]').click();
    });

    expect(container.querySelector('select').value).toBe('anthropic');
    expect(container.textContent).toContain('Claude API key');
    expect(container.querySelector('input[type="text"]').value).toBe('claude-sonnet-4-6');

    await act(async () => root.unmount());
  });

  it('migrates legacy settings to Groq without storing API keys in localStorage', async () => {
    localStorage.setItem('dataduck-ai-settings', JSON.stringify({ model: 'llama-3.3-70b-versatile', rememberKey: true }));
    loadProviderKey.mockImplementation(async (providerId) => (providerId === 'groq' ? 'gsk_legacy' : ''));

    const { container, root } = await renderAssistant();

    await act(async () => {
      container.querySelector('[aria-label="AI settings"]').click();
    });

    expect(container.querySelector('select').value).toBe('groq');
    expect(container.querySelector('input[type="password"]').value).toBe('gsk_legacy');
    expect(localStorage.getItem('dataduck-ai-settings')).not.toContain('gsk_legacy');

    await act(async () => root.unmount());
  });

  it('treats partial legacy settings as Groq so remembered keys still load', async () => {
    localStorage.setItem('dataduck-ai-settings', JSON.stringify({ rememberKey: true }));
    loadProviderKey.mockImplementation(async (providerId) => (providerId === 'groq' ? 'gsk_partial' : ''));

    const { container, root } = await renderAssistant();

    await act(async () => {
      container.querySelector('[aria-label="AI settings"]').click();
    });

    expect(container.querySelector('select').value).toBe('groq');
    expect(container.querySelector('input[type="password"]').value).toBe('gsk_partial');

    await act(async () => root.unmount());
  });

  it('switches provider fields and blocks API keys pasted into the model input', async () => {
    const showToast = vi.fn();
    const { container, root } = await renderAssistant({ showToast });

    await act(async () => {
      container.querySelector('[aria-label="AI settings"]').click();
    });
    await act(async () => {
      inputValue(container.querySelector('select'), 'groq');
    });

    expect(container.textContent).toContain('Groq API key');
    expect(container.querySelector('input[type="text"]').value).toBe('openai/gpt-oss-120b');

    await act(async () => {
      inputValue(container.querySelector('input[type="text"]'), 'sk-ant-this-is-a-key');
    });

    expect(container.querySelector('input[type="text"]').value).toBe('openai/gpt-oss-120b');
    expect(showToast).toHaveBeenCalledWith('That looks like an API key. Paste it in the API key field.', 'error');

    await act(async () => root.unmount());
  });

  it('submits questions with the selected provider settings', async () => {
    localStorage.setItem('dataduck-ai-settings', JSON.stringify({
      providerId: 'anthropic',
      rememberKey: true,
      providers: { anthropic: { model: 'claude-sonnet-4-6' }, groq: { model: 'openai/gpt-oss-120b' } },
    }));
    loadProviderKey.mockImplementation(async (providerId) => (providerId === 'anthropic' ? 'sk-ant-live' : ''));
    const { container, root } = await renderAssistant();

    await act(async () => {
      inputValue(container.querySelector('textarea'), 'top products');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(answerDataQuestion).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        providerId: 'anthropic',
        providers: expect.objectContaining({
          anthropic: expect.objectContaining({ apiKey: 'sk-ant-live', model: 'claude-sonnet-4-6' }),
        }),
      }),
    }));

    await act(async () => root.unmount());
  });
});
