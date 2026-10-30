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
  it('uses the generic active_file alias before a file is opened', () => {
    const work = document.createElement('main');
    const store = createStore({ activeTable: null, files: new Map(), isBusy: false });
    const editor = mountEditor(work, store, { onRun: vi.fn() });

    expect(editor.getSql()).toBe('SELECT *\nFROM active_file\nLIMIT 500;');
  });

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
    expect(editor.getSql()).toBe('DESCRIBE lab;');

    sample.click();
    expect(editor.getSql()).toBe('SELECT *\nFROM lab\nORDER BY random()\nLIMIT 100;');
  });

  it('runs read-only tabs on activation so results match the tab', () => {
    const work = document.createElement('main');
    const onRun = vi.fn();
    const store = createStore({ activeTable: 'lab', files: new Map([['lab', {}]]), isBusy: false });
    mountEditor(work, store, { onRun });

    work.querySelector('[data-editor-tab="schema"]').click();
    expect(onRun).toHaveBeenCalledTimes(1);
    work.querySelector('[data-editor-tab="query"]').click();
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(work.querySelector('[role="tablist"]')).not.toBeNull();
    expect(work.querySelector('[data-editor-tab="query"]').getAttribute('role')).toBe('tab');
  });

  it('puts Run in the editor bar and reports failed and stale runs', () => {
    const work = document.createElement('main');
    const onRun = vi.fn();
    const store = createStore({ activeTable: 'lab', files: new Map([['lab', {}]]), isBusy: false });
    const editor = mountEditor(work, store, { onRun });
    const run = work.querySelector('.editor .foot #eRun');
    const status = work.querySelector('#eStatus');

    expect(run.disabled).toBe(false);
    run.click();
    expect(onRun).toHaveBeenCalledTimes(1);

    store.emit({ lastRunSql: editor.getSql().trim(), queryError: 'Parser Error' });
    expect(status.textContent).toBe('Query failed');

    store.emit({ queryError: null });
    expect(status.textContent).toBe('Up to date');

    editor.setSql('SELECT 1;');
    expect(status.textContent).toBe('Results are from an earlier query');

    store.emit({ activeTable: null });
    expect(run.disabled).toBe(true);
  });

  it('disables schema and sample tabs before a file is opened', () => {
    const work = document.createElement('main');
    const store = createStore({ activeTable: null, files: new Map(), isBusy: false });

    mountEditor(work, store, { onRun: vi.fn() });

    expect(work.querySelector('[data-editor-tab="schema"]').disabled).toBe(true);
    expect(work.querySelector('[data-editor-tab="sample"]').disabled).toBe(true);
  });
});
