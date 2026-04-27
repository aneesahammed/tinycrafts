import { describe, expect, it, vi } from 'vitest';
import { mountEditor } from '../src/ui/editor.js';

function createStore(state) {
  const listeners = [];
  return {
    state,
    subscribe: vi.fn((listener) => {
      listeners.push(listener);
    }),
    emit(nextState) {
      Object.assign(state, nextState);
      listeners.forEach((listener) => listener(state));
    },
  };
}

describe('editor helper tabs', () => {
  it('offers schema and sample tabs for the active table', () => {
    const work = document.createElement('main');
    const store = createStore({ activeTable: 'lab', files: new Map([['lab', {}]]), isBusy: false });
    const editor = mountEditor(work, store, { onRun: vi.fn() });

    const schema = work.querySelector('[data-editor-tab="schema"]');
    const sample = work.querySelector('[data-editor-tab="sample"]');
    expect(schema).not.toBeNull();
    expect(sample).not.toBeNull();
    expect(schema.disabled).toBe(false);
    expect(sample.disabled).toBe(false);

    schema.click();
    expect(editor.getSql()).toBe('DESCRIBE SELECT *\nFROM lab;');

    sample.click();
    expect(editor.getSql()).toBe('SELECT *\nFROM lab\nORDER BY random()\nLIMIT 100;');
  });

  it('disables schema and sample tabs before a file is opened', () => {
    const work = document.createElement('main');
    const store = createStore({ activeTable: null, files: new Map(), isBusy: false });

    mountEditor(work, store, { onRun: vi.fn() });

    expect(work.querySelector('[data-editor-tab="schema"]').disabled).toBe(true);
    expect(work.querySelector('[data-editor-tab="sample"]').disabled).toBe(true);
  });
});
