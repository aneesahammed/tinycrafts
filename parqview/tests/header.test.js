import { describe, expect, it, vi } from 'vitest';
import { mountHeader } from '../src/ui/header.js';

function createStore() {
  const listeners = [];
  return {
    subscribe: vi.fn((listener) => {
      listeners.push(listener);
    }),
    emit(state) {
      listeners.forEach((listener) => listener(state));
    },
  };
}

describe('header empty state', () => {
  it('does not show redundant no-file crumb before a file is opened', () => {
    const header = document.createElement('header');
    const store = createStore();

    mountHeader(header, store, {
      onRun: vi.fn(),
      onToggleTheme: vi.fn(),
      onOpenPalette: vi.fn(),
    });

    expect(header.textContent).not.toContain('No file');
    expect(header.querySelector('.crumb').hidden).toBe(true);
  });

  it('shows the active file crumb after a file is opened', () => {
    const header = document.createElement('header');
    const store = createStore();

    mountHeader(header, store, {
      onRun: vi.fn(),
      onToggleTheme: vi.fn(),
      onOpenPalette: vi.fn(),
    });
    store.emit({
      activeTable: 'cur',
      files: new Map([
        [
          'cur',
          {
            size: 1024,
            profile: { schema: [{ name: 'usage_date' }], fileMeta: { num_rows: 42 } },
          },
        ],
      ]),
      isBusy: false,
    });

    expect(header.querySelector('.crumb').hidden).toBe(false);
    expect(header.querySelector('#hCrumbFile').textContent).toBe('cur');
    expect(header.textContent).toContain('42 rows');
  });
});
