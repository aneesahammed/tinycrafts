import { restoreTheme, toggleTheme } from './ui/theme.js';
import { createStore } from './state/store.js';
import { getEngine, query } from './duckdb/engine.js';
import { openFileInto, closeFile, setActiveFile, isSupportedFile } from './duckdb/files.js';
import {
  applyAcceptExtensions,
  unsupportedFilesMessage,
  unsupportedFileTypeMessage,
} from './duckdb/formats.js';
import { summarizeTable } from './duckdb/summarize.js';
import { withNormalizedRowCount } from './duckdb/profile-row-count.js';
import { showToast, toErrorMessage } from './ui/toast.js';
import { showCsvRecoveryToast } from './ui/csv-recovery.js';
import { mountHeader } from './ui/header.js';
import { mountRail } from './ui/rail.js';
import { mountEditor } from './ui/editor.js';
import { mountResult } from './ui/result.js';
import { mountStatus } from './ui/status.js';
import { mountEmpty } from './ui/empty.js';
import { mountPalette } from './ui/palette.js';
import { getRecentFileRecord } from './state/recents.js';
import { mountProfiler } from './ui/profiler.js';
import { profileColumn } from './duckdb/column-profile.js';
import { mountQuerySnapshots } from './ui/query-snapshots.js';
import { setupRailResize } from './ui/rail-resizer.js';
import { setupServiceWorker } from './service-worker.js';
import { mountAiAssistant } from './assistant/mount.jsx';
import {
  clearQuerySnapshots,
  createQuerySnapshot,
  deleteQuerySnapshot,
  getQuerySnapshotStorageStatus,
  listQuerySnapshots,
  recordQuerySnapshot,
  replaceQuerySnapshots,
  seedSnapshotClock,
  setQuerySnapshotPinned,
  sortQuerySnapshots,
} from './state/query-snapshots.js';

restoreTheme();

const store = createStore();
const head = document.querySelector('#head');
const rail = document.querySelector('#rail');
const stage = document.querySelector('#stage');
const work = document.querySelector('#work');
const fileInput = document.querySelector('#fileInput');
const paletteScrim = document.querySelector('#paletteScrim');

applyAcceptExtensions(fileInput);

mountHeader(head, store, {
  onRun: () => runActiveQuery(),
  onToggleTheme: () => toggleTheme(),
  onOpenPalette: () => store.setPaletteOpen(true),
  onOpenSnapshots: toggleSnapshotsPanel,
  onOpenAssistant: () => assistant.toggle(),
});

const editor = mountEditor(work, store, { onRun: runActiveQuery });
const profiler = mountProfiler(stage, store, {
  loadProfile: profileColumn,
  setSql: (sql) => editor.setSql(sql),
});
const snapshotsPanel = mountQuerySnapshots(stage, store, {
  onRestore: restoreSnapshot,
  onRerun: rerunSnapshot,
  onTogglePin: toggleSnapshotPin,
  onCopy: copySnapshotSql,
  onDelete: deleteSnapshotWithUndo,
  onClear: clearSnapshotsWithUndo,
});
const assistant = mountAiAssistant(stage, store, {
  query,
  setSql: (sql) => editor.setSql(sql),
  showToast,
});

mountRail(rail, store, {
  onPickFiles: () => fileInput.click(),
  onClose: (table) => closeFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onSwitch: (table) => setActiveFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onColClick: (payload) => profiler.open(payload),
  onSummarize: (table) => summarizeOpenFile(table),
});

setupRailResize(stage, document.querySelector('#railResizer'));

mountResult(work, store);
mountStatus(work, store, { onOpenSnapshots: toggleSnapshotsPanel });
mountEmpty(work, store, {
  onPickFiles: () => fileInput.click(),
  onOpenRecent: openRecentFile,
});

work.dataset.state = 'empty';
store.subscribe((s) => {
  work.dataset.state = s.files.size > 0 ? 'loaded' : 'empty';
});

mountPalette(paletteScrim, store, {
  setSql: (sql) => editor.setSql(sql),
  switchActive: (name) => setActiveFile(store, name),
  pickFiles: () => fileInput.click(),
  run: runActiveQuery,
  exportCsv: () => document.querySelector('#sExport')?.click(),
  openSnapshots: () => snapshotsPanel.open(),
  openAssistant: () => assistant.open(),
  toggleTheme,
  closeAll: async () => {
    for (const t of [...store.state.files.keys()]) {
      await closeFile(store, t);
    }
  },
});

listQuerySnapshots()
  .then((snapshots) => {
    seedSnapshotClock(snapshots);
    store.setQuerySnapshots(snapshots);
    notifySnapshotStorageIfNeeded();
  })
  .catch((error) => {
    showToast(`Query snapshots are session-only: ${toErrorMessage(error)}`, 'error');
  });

async function openFiles(files, options = {}) {
  const selected = Array.from(files || []);
  const supported = selected.filter(isSupportedFile);
  const unsupportedCount = selected.length - supported.length;

  if (!supported.length) {
    if (selected.length) showToast(unsupportedFileTypeMessage(), 'error');
    return;
  }

  for (const file of supported) {
    store.setBusy(true, `Opening ${file.name}`);
    try {
      const { tableName, warnings } = await openFileInto(store, file, options);
      editor.setSql(`SELECT *\nFROM ${tableName}\nLIMIT 500;`);
      for (const warning of warnings || []) showToast(warning);
    } catch (error) {
      if (!showCsvRecoveryToast({ error, file, csvMode: options.csvMode, showToast, reopen: reopenCsvAsText })) {
        showToast(toErrorMessage(error), 'error');
      }
    } finally {
      store.setBusy(false);
    }
  }

  if (unsupportedCount) showToast(unsupportedFilesMessage(unsupportedCount), 'error');
}

async function openRecentFile(name) {
  try {
    const recent = await getRecentFileRecord(name);
    if (!recent?.file) {
      showToast(`Choose ${name} again to grant browser access.`, 'error');
      fileInput.click();
      return;
    }
    await openFiles([recent.file], recent.csvMode ? { csvMode: recent.csvMode } : {});
  } catch (error) {
    showToast(toErrorMessage(error), 'error');
  }
}

fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  await openFiles(files);
});

function isTypingTarget(target) {
  return Boolean(
    target?.closest?.(
      'input, textarea, select, [contenteditable="true"], .assistant-panel, .assistant-composer',
    ),
  );
}

window.addEventListener('keydown', (event) => {
  if (isTypingTarget(event.target)) return;
  const meta = event.ctrlKey || event.metaKey;
  if (!meta) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    runActiveQuery();
  } else if (event.key.toLowerCase() === 'k') {
    event.preventDefault();
    store.setPaletteOpen(!store.state.paletteOpen);
  } else if (event.key.toLowerCase() === 'o') {
    event.preventDefault();
    fileInput.click();
  } else if (event.key.toLowerCase() === 'd') {
    event.preventDefault();
    toggleTheme();
  } else if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    const n = Number(event.key);
    const tables = [...store.state.files.keys()];
    if (tables[n - 1]) setActiveFile(store, tables[n - 1]);
  }
});

['dragenter', 'dragover'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    e.preventDefault();
    document.querySelector('#emptyDrop')?.classList.add('over');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  window.addEventListener(evt, () => {
    document.querySelector('#emptyDrop')?.classList.remove('over');
  });
});

window.addEventListener('drop', async (event) => {
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || []);
  await openFiles(files);
});

async function runActiveQuery() {
  if (store.state.isBusy) return;
  const sql = editor.getSql().trim();
  if (!sql) {
    showToast('Enter a SQL query first.', 'error');
    return;
  }
  store.setBusy(true, 'Running query');
  const startedAt = performance.now();
  try {
    await getEngine();
    const result = await query(sql);
    const elapsedMs = Math.round(performance.now() - startedAt);
    store.setResult({
      columns: result.columns,
      rows: result.rows,
      elapsedMs,
    });
    captureQuerySnapshot({ sql, result, elapsedMs });
  } catch (error) {
    const active = store.state.activeTable;
    const record = active ? store.state.files.get(active) : null;
    if (
      !showCsvRecoveryToast({
        error,
        file: record?.file,
        csvMode: record?.csvMode,
        replaceTable: active,
        showToast,
        reopen: reopenCsvAsText,
      })
    ) {
      showToast(toErrorMessage(error), 'error');
    }
  } finally {
    store.setBusy(false);
  }
}

async function reopenCsvAsText(file, replaceTable = null) {
  try {
    if (replaceTable && store.state.files.has(replaceTable)) await closeFile(store, replaceTable);
    await openFiles([file], { csvMode: 'text' });
  } catch (error) {
    showToast(toErrorMessage(error), 'error');
  }
}

async function summarizeOpenFile(tableName) {
  const record = store.state.files.get(tableName);
  if (!record) return;

  store.setBusy(true, `Summarizing ${tableName}`);
  try {
    const summary = await summarizeTable(tableName);
    const current = store.state.files.get(tableName);
    if (!current) return;
    store.updateFile(tableName, {
      summary,
      summaryStatus: 'ready',
      profile: withNormalizedRowCount(current.profile, summary),
    });
  } catch (error) {
    if (store.state.files.has(tableName)) store.updateFile(tableName, { summaryStatus: 'failed' });
    showToast(toErrorMessage(error), 'error');
  } finally {
    store.setBusy(false);
  }
}

function captureQuerySnapshot({ sql, result, elapsedMs }) {
  const snapshot = createQuerySnapshot({
    sql,
    activeTable: store.state.activeTable,
    rowCount: result.rows.length,
    elapsedMs,
    columns: result.columns,
  });
  if (!snapshot) return;
  store.addQuerySnapshot(snapshot);
  recordQuerySnapshot(snapshot)
    .then((snapshots) => {
      store.setQuerySnapshots(snapshots);
      notifySnapshotStorageIfNeeded();
    })
    .catch((error) => showToast(`Could not save query snapshot: ${toErrorMessage(error)}`, 'error'));
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  editor.setSql(snapshot.sql);
}

function rerunSnapshot(snapshot) {
  if (!snapshot) return;
  editor.setSql(snapshot.sql);
  if (snapshot.activeTable && !store.state.files.has(snapshot.activeTable)) {
    showToast(`Open ${snapshot.activeTable} before rerunning this snapshot.`, 'error');
    return;
  }
  snapshotsPanel.close();
  runActiveQuery();
}

function toggleSnapshotPin(snapshot) {
  if (!snapshot) return;
  const pinned = !snapshot.pinned;
  const previous = store.state.querySnapshots;
  store.updateQuerySnapshot(snapshot.id, { pinned, pinnedAt: pinned ? Date.now() : null });
  setQuerySnapshotPinned(snapshot.id, pinned)
    .then((snapshots) => store.setQuerySnapshots(snapshots))
    .catch((error) => {
      store.setQuerySnapshots(previous);
      showToast(toErrorMessage(error), 'error');
    });
}

function copySnapshotSql(sql) {
  if (!navigator.clipboard?.writeText) {
    showToast('Clipboard is unavailable.', 'error');
    return;
  }
  navigator.clipboard
    .writeText(sql)
    .then(() => showToast('SQL copied.'))
    .catch(() => showToast('Could not copy SQL.', 'error'));
}

function deleteSnapshotWithUndo(snapshot) {
  if (!snapshot) return;
  const previous = store.state.querySnapshots;
  store.removeQuerySnapshot(snapshot.id);
  deleteQuerySnapshot(snapshot.id)
    .then((snapshots) => store.setQuerySnapshots(snapshots))
    .catch((error) => {
      store.setQuerySnapshots(previous);
      showToast(toErrorMessage(error), 'error');
    });
  showToast('Query snapshot deleted.', '', {
    label: 'Undo',
    run: () => {
      const restored = sortQuerySnapshots([snapshot, ...store.state.querySnapshots]);
      store.setQuerySnapshots(restored);
      replaceQuerySnapshots(restored).catch((error) => showToast(toErrorMessage(error), 'error'));
    },
  });
}

function clearSnapshotsWithUndo() {
  if (!store.state.querySnapshots.length) return;
  if (!window.confirm('Clear all query snapshots? This only removes local query history.')) return;
  const previous = store.state.querySnapshots;
  store.setQuerySnapshots([]);
  clearQuerySnapshots().catch((error) => {
    store.setQuerySnapshots(previous);
    showToast(toErrorMessage(error), 'error');
  });
  showToast('Query snapshots cleared.', '', {
    label: 'Undo',
    run: () => {
      store.setQuerySnapshots(previous);
      replaceQuerySnapshots(previous).catch((error) => showToast(toErrorMessage(error), 'error'));
    },
  });
}

function toggleSnapshotsPanel() {
  if (store.state.rightPanel?.type === 'snapshots') snapshotsPanel.close();
  else snapshotsPanel.open();
}

let snapshotStorageNoticeShown = false;
function notifySnapshotStorageIfNeeded() {
  const status = getQuerySnapshotStorageStatus();
  if (!status.degraded || snapshotStorageNoticeShown) return;
  snapshotStorageNoticeShown = true;
  showToast('Query snapshots are session-only in this browser mode.', 'error');
}

setupServiceWorker().catch((e) => console.warn('SW setup failed', e));
