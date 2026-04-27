import '../styles.css';
import { restoreTheme, toggleTheme } from './ui/theme.js';
import { createStore } from './state/store.js';
import { getEngine, query } from './duckdb/engine.js';
import { openFileInto, closeFile, setActiveFile, looksLikeParquet } from './duckdb/files.js';
import { showToast, toErrorMessage } from './ui/toast.js';
import { mountHeader } from './ui/header.js';
import { mountRail } from './ui/rail.js';
import { mountEditor } from './ui/editor.js';
import { mountResult } from './ui/result.js';
import { mountStatus } from './ui/status.js';
import { mountEmpty } from './ui/empty.js';
import { mountPalette } from './ui/palette.js';

restoreTheme();

const store = createStore();
const head = document.querySelector('#head');
const rail = document.querySelector('#rail');
const work = document.querySelector('#work');
const fileInput = document.querySelector('#fileInput');
const paletteScrim = document.querySelector('#paletteScrim');

mountHeader(head, store, {
  onRun: () => runActiveQuery(),
  onToggleTheme: () => toggleTheme(),
  onOpenPalette: () => store.setPaletteOpen(true),
});

mountRail(rail, store, {
  onPickFiles: () => fileInput.click(),
  onClose: (table) => closeFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onSwitch: (table) => setActiveFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onColClick: (col) => {
    const active = store.state.activeTable;
    if (!active) return;
    editor.setSql(`SELECT ${col}\nFROM ${active}\nLIMIT 500;`);
  },
});

const editor = mountEditor(work, store, { onRun: runActiveQuery });
mountResult(work, store);
mountStatus(work, store);
mountEmpty(work, store, { onPickFiles: () => fileInput.click() });

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
  toggleTheme,
  closeAll: async () => {
    for (const t of [...store.state.files.keys()]) {
      await closeFile(store, t);
    }
  },
});

fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  for (const file of files) {
    try {
      const table = await openFileInto(store, file);
      editor.setSql(`SELECT *\nFROM ${table}\nLIMIT 500;`);
    } catch (error) {
      showToast(toErrorMessage(error), 'error');
    }
  }
});

window.addEventListener('keydown', (event) => {
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
  const files = Array.from(event.dataTransfer?.files || []).filter(looksLikeParquet);
  for (const file of files) {
    try {
      await openFileInto(store, file);
    } catch (error) {
      showToast(toErrorMessage(error), 'error');
    }
  }
});

async function runActiveQuery() {
  if (store.state.isBusy) return;
  const sql = editor.getSql().trim();
  if (!sql) {
    showToast('Enter a SQL query first.', 'error');
    return;
  }
  store.setBusy(true);
  const startedAt = performance.now();
  try {
    await getEngine();
    const result = await query(sql);
    store.setResult({
      columns: result.columns,
      rows: result.rows,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    showToast(toErrorMessage(error), 'error');
  } finally {
    store.setBusy(false);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(new URL('../sw.js', import.meta.url), { scope: './' })
    .catch((e) => console.warn('SW registration failed', e));
}
