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

  it('shows the command palette trigger as a command button, not a fake search field', () => {
    const header = document.createElement('header');
    const store = createStore();

    mountHeader(header, store, {
      onRun: vi.fn(),
      onToggleTheme: vi.fn(),
      onOpenPalette: vi.fn(),
    });

    const trigger = header.querySelector('#hPalette');
    expect(trigger.classList.contains('cmd-trigger')).toBe(true);
    expect(trigger.getAttribute('aria-label')).toBe('Open command menu');
    expect(trigger.textContent).toContain('Commands');
    expect(trigger.textContent).not.toContain('Search');
    expect(trigger.querySelectorAll('kbd')).toHaveLength(2);
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

  it('uses normalized row counts when parquet metadata is unavailable', () => {
    const header = document.createElement('header');
    const store = createStore();

    mountHeader(header, store, {
      onRun: vi.fn(),
      onToggleTheme: vi.fn(),
      onOpenPalette: vi.fn(),
    });
    store.emit({
      activeTable: 'sales',
      files: new Map([
        [
          'sales',
          {
            size: 2048,
            format: 'csv',
            profile: { rowCount: 17, schema: [{ name: 'id' }, { name: 'name' }] },
          },
        ],
      ]),
      isBusy: false,
    });

    expect(header.textContent).toContain('17 rows');
    expect(header.textContent).toContain('2 cols');
  });
});
