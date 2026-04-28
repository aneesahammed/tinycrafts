import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEmpty } from '../src/ui/empty.js';
import { listRecents } from '../src/state/recents.js';

vi.mock('../src/state/recents.js', () => ({
  listRecents: vi.fn(),
  clearRecents: vi.fn(),
}));

function createStore() {
  return {
    state: {
      files: new Map(),
      isBusy: false,
      busyLabel: null,
    },
    subscribe: vi.fn(),
  };
}

describe('empty recent files', () => {
  beforeEach(() => {
    listRecents.mockResolvedValue([
      { name: 'cur.parquet', size: 13_700_000, openedAt: Date.now() - 60_000 },
    ]);
  });

  it('calls the recent-open handler when a recent file is selected', async () => {
    const host = document.createElement('main');
    const onOpenRecent = vi.fn();

    mountEmpty(host, createStore(), {
      onPickFiles: vi.fn(),
      onOpenRecent,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    host.querySelector('[data-recent-index="0"]').click();

    expect(onOpenRecent).toHaveBeenCalledWith('cur.parquet');
  });

  it('describes the empty state as a local data-file picker', async () => {
    const host = document.createElement('main');
    listRecents.mockResolvedValueOnce([]);

    mountEmpty(host, createStore(), {
      onPickFiles: vi.fn(),
      onOpenRecent: vi.fn(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).toContain('Open a local data file');
    expect(host.textContent).toContain('Parquet and CSV supported');
    expect(host.textContent).not.toContain('Open a .parquet file');
  });
});
