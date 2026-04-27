import { describe, expect, it, vi } from 'vitest';
import { mountHeader } from '../src/ui/header.js';
import { buildCommands } from '../src/ui/palette-filter.js';
import { mountQuerySnapshots } from '../src/ui/query-snapshots.js';
import { mountStatus } from '../src/ui/status.js';

function createStore(state) {
  const listeners = [];
  return {
    state,
    subscribe: vi.fn((listener) => {
      listeners.push(listener);
      return () => {};
    }),
    emit(nextState) {
      Object.assign(state, nextState);
      listeners.forEach((listener) => listener(state));
    },
    setRightPanel: vi.fn((panel) => {
      state.rightPanel = panel;
      listeners.forEach((listener) => listener(state));
    }),
    setPage: vi.fn(),
  };
}

const snapshot = {
  id: 'snap-1',
  sql: 'SELECT service_name, COUNT(*) AS rows FROM lab GROUP BY 1;',
  title: 'SELECT service_name, COUNT(*) AS rows FROM lab GROUP BY 1',
  activeTable: 'lab',
  rowCount: 8,
  elapsedMs: 42,
  columns: ['service_name', 'rows'],
  ranAt: Date.now() - 60_000,
  pinned: false,
  pinnedAt: null,
};

describe('query snapshots UI', () => {
  it('renders a searchable snapshots right panel with compact row actions', () => {
    const work = document.createElement('main');
    const store = createStore({
      querySnapshots: [
        { ...snapshot, id: 'pin', pinned: true, pinnedAt: Date.now(), title: 'Pinned service rollup' },
        snapshot,
      ],
      rightPanel: null,
    });
    const handlers = {
      onRestore: vi.fn(),
      onRerun: vi.fn(),
      onTogglePin: vi.fn(),
      onCopy: vi.fn(),
      onDelete: vi.fn(),
      onClear: vi.fn(),
    };

    const panel = mountQuerySnapshots(work, store, handlers);
    panel.open();

    expect(work.querySelector('.right-panel').hidden).toBe(false);
    expect(work.querySelector('.right-panel').getAttribute('aria-label')).toBe('Query snapshots');
    expect(work.querySelector('.snapshot-section').textContent).toContain('Pinned');
    expect(work.querySelector('.snapshot-copy').textContent).toContain('Last 20 unpinned runs');

    work.querySelector('.snapshot-search').value = 'rollup';
    work.querySelector('.snapshot-search').dispatchEvent(new Event('input'));
    expect(work.querySelectorAll('.snapshot-row')).toHaveLength(1);

    work.querySelector('.snapshot-row').click();
    expect(handlers.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'pin' }));

    panel.open();
    work.querySelector('.snapshot-row').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handlers.onRestore).toHaveBeenCalledTimes(2);

    panel.open();
    work.querySelector('[data-snapshot-action="rerun"]').click();
    expect(handlers.onRerun).toHaveBeenCalledWith(expect.objectContaining({ id: 'pin' }));

    work.querySelector('[data-snapshot-action="pin"]').click();
    expect(handlers.onTogglePin).toHaveBeenCalledWith(expect.objectContaining({ id: 'pin' }));

    work.querySelector('[data-snapshot-action="copy"]').click();
    expect(handlers.onCopy).toHaveBeenCalledWith(snapshot.sql);

    work.querySelector('[data-snapshot-action="delete"]').click();
    expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'pin' }));
  });

  it('opens from header and status entry points when snapshots exist', () => {
    const header = document.createElement('header');
    const onOpenSnapshots = vi.fn();
    const headerStore = createStore({
      activeTable: null,
      files: new Map(),
      isBusy: false,
      querySnapshots: [snapshot],
    });

    mountHeader(header, headerStore, {
      onRun: vi.fn(),
      onToggleTheme: vi.fn(),
      onOpenPalette: vi.fn(),
      onOpenSnapshots,
    });
    headerStore.emit(headerStore.state);
    header.querySelector('#hSnapshots').click();
    expect(onOpenSnapshots).toHaveBeenCalled();

    const work = document.createElement('main');
    const onStatusSnapshots = vi.fn();
    const statusStore = createStore({
      resultColumns: ['a'],
      resultRows: [{ a: 1 }],
      queryElapsedMs: 7,
      page: 0,
      pageSize: 100,
      isBusy: false,
      querySnapshots: [snapshot],
    });
    mountStatus(work, statusStore, { onOpenSnapshots: onStatusSnapshots });
    statusStore.emit(statusStore.state);
    work.querySelector('#sSnapshots').click();
    expect(onStatusSnapshots).toHaveBeenCalled();
  });

  it('adds recent snapshot commands and a show-all command to the palette', () => {
    const setSql = vi.fn();
    const openSnapshots = vi.fn();
    const run = vi.fn();
    const commands = buildCommands(
      {
        activeTable: 'lab',
        files: new Map([['lab', {}]]),
        querySnapshots: [snapshot, { ...snapshot, id: 'snap-2', title: 'Second query', sql: 'SELECT 2' }],
      },
      {
        setSql,
        openSnapshots,
        run,
        switchActive: vi.fn(),
        pickFiles: vi.fn(),
        exportCsv: vi.fn(),
        toggleTheme: vi.fn(),
        closeAll: vi.fn(),
      },
    );

    const snapshotCommand = commands.find((command) => command.title.includes(snapshot.title));
    expect(snapshotCommand.group).toBe('Runs');
    snapshotCommand.run();
    expect(setSql).toHaveBeenCalledWith(snapshot.sql);

    commands.find((command) => command.title === 'Show all query snapshots').run();
    expect(openSnapshots).toHaveBeenCalled();
  });
});
