import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbWorkerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbWorkerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: duckdbWasmMvp,
    mainWorker: duckdbWorkerMvp,
  },
  eh: {
    mainModule: duckdbWasmEh,
    mainWorker: duckdbWorkerEh,
  },
};

const TABLE_ALIAS = 'parquet_file';
const DEFAULT_QUERY = `SELECT *\nFROM ${TABLE_ALIAS}\nLIMIT 500;`;

const state = {
  db: null,
  conn: null,
  worker: null,
  activeFile: null,
  virtualFileName: null,
  fileMeta: null,
  schemaRows: [],
  rowGroups: [],
  codecs: [],
  resultColumns: [],
  resultRows: [],
  page: 0,
  pageSize: 100,
  resultFilter: '',
  schemaFilter: '',
  isBusy: false,
  initialized: false,
  sampleIndex: 0,
  installPrompt: null,
};

const el = {
  engineStatus: document.querySelector('#engineStatus'),
  openFileButton: document.querySelector('#openFileButton'),
  installButton: document.querySelector('#installButton'),
  themeButton: document.querySelector('#themeButton'),
  fileInput: document.querySelector('#fileInput'),
  dropzone: document.querySelector('#dropzone'),
  clearButton: document.querySelector('#clearButton'),
  fileName: document.querySelector('#fileName'),
  fileSize: document.querySelector('#fileSize'),
  rowCount: document.querySelector('#rowCount'),
  columnCount: document.querySelector('#columnCount'),
  rowGroupCount: document.querySelector('#rowGroupCount'),
  compression: document.querySelector('#compression'),
  copySchemaButton: document.querySelector('#copySchemaButton'),
  schemaSearch: document.querySelector('#schemaSearch'),
  schemaList: document.querySelector('#schemaList'),
  sampleQueryButton: document.querySelector('#sampleQueryButton'),
  runQueryButton: document.querySelector('#runQueryButton'),
  sqlEditor: document.querySelector('#sqlEditor'),
  queryRuntime: document.querySelector('#queryRuntime'),
  resultSummary: document.querySelector('#resultSummary'),
  pageSizeSelect: document.querySelector('#pageSizeSelect'),
  resultSearch: document.querySelector('#resultSearch'),
  exportButton: document.querySelector('#exportButton'),
  tableWrap: document.querySelector('#tableWrap'),
  prevPageButton: document.querySelector('#prevPageButton'),
  nextPageButton: document.querySelector('#nextPageButton'),
  pageInfo: document.querySelector('#pageInfo'),
  refreshMetadataButton: document.querySelector('#refreshMetadataButton'),
  metadataList: document.querySelector('#metadataList'),
  rowGroupSummary: document.querySelector('#rowGroupSummary'),
  rowGroupTable: document.querySelector('#rowGroupTable'),
  toast: document.querySelector('#toast'),
};

boot();

function boot() {
  restoreTheme();
  wireEvents();
  registerServiceWorker();
  setControlsEnabled(false);
}

function wireEvents() {
  el.openFileButton.addEventListener('click', () => el.fileInput.click());
  el.dropzone.addEventListener('click', () => el.fileInput.click());
  el.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      el.fileInput.click();
    }
  });

  el.fileInput.addEventListener('change', async () => {
    const [file] = Array.from(el.fileInput.files || []);
    if (file) await openParquetFile(file);
    el.fileInput.value = '';
  });

  for (const eventName of ['dragenter', 'dragover']) {
    el.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      el.dropzone.classList.add('is-dragging');
    });
  }

  for (const eventName of ['dragleave', 'drop']) {
    el.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      el.dropzone.classList.remove('is-dragging');
    });
  }

  el.dropzone.addEventListener('drop', async (event) => {
    const [file] = Array.from(event.dataTransfer?.files || []);
    if (file) await openParquetFile(file);
  });

  el.runQueryButton.addEventListener('click', () => runQuery());
  el.sampleQueryButton.addEventListener('click', applyNextSampleQuery);
  el.exportButton.addEventListener('click', exportCsv);
  el.copySchemaButton.addEventListener('click', copySchemaSql);
  el.clearButton.addEventListener('click', clearFile);
  el.refreshMetadataButton.addEventListener('click', refreshMetadata);
  el.themeButton.addEventListener('click', toggleTheme);

  el.sqlEditor.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!el.runQueryButton.disabled) runQuery();
    }
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      el.fileInput.click();
    }
  });

  el.schemaSearch.addEventListener('input', () => {
    state.schemaFilter = el.schemaSearch.value.trim().toLowerCase();
    renderSchemaList();
  });

  el.resultSearch.addEventListener('input', () => {
    state.resultFilter = el.resultSearch.value.trim().toLowerCase();
    state.page = 0;
    renderResultTable();
  });

  el.pageSizeSelect.addEventListener('change', () => {
    state.pageSize = Number(el.pageSizeSelect.value) || 100;
    state.page = 0;
    renderResultTable();
  });

  el.prevPageButton.addEventListener('click', () => {
    state.page = Math.max(0, state.page - 1);
    renderResultTable();
  });

  el.nextPageButton.addEventListener('click', () => {
    const rows = getFilteredRows();
    const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(pageCount - 1, state.page + 1);
    renderResultTable();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    el.installButton.classList.remove('hidden');
  });

  el.installButton.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    el.installButton.classList.add('hidden');
  });
}

async function initDuckDB() {
  if (state.initialized) return;

  setStatus('Loading DuckDB', 'busy');
  try {
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    state.worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    state.db = new duckdb.AsyncDuckDB(logger, state.worker);
    await state.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    state.conn = await state.db.connect();
    state.initialized = true;
    setStatus('DuckDB ready');
  } catch (error) {
    setStatus('DuckDB failed', 'error');
    throw error;
  }
}

async function openParquetFile(file) {
  if (!looksLikeParquet(file)) {
    showToast('Choose a file with a .parquet or .parq extension.', 'error');
    return;
  }

  setBusy(true, 'Opening file');
  try {
    await initDuckDB();

    state.activeFile = file;
    state.virtualFileName = createVirtualFileName(file.name);
    state.fileMeta = null;
    state.schemaRows = [];
    state.rowGroups = [];
    state.codecs = [];
    state.resultRows = [];
    state.resultColumns = [];
    state.resultFilter = '';
    state.schemaFilter = '';
    state.page = 0;
    state.sampleIndex = 0;

    el.resultSearch.value = '';
    el.schemaSearch.value = '';
    el.sqlEditor.value = DEFAULT_QUERY;

    await state.db.registerFileHandle(
      state.virtualFileName,
      file,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true,
    );

    await state.conn.query(
      `CREATE OR REPLACE VIEW ${quoteIdentifier(TABLE_ALIAS)} AS SELECT * FROM read_parquet(${quoteString(state.virtualFileName)});`,
    );

    await loadFileProfile();
    setControlsEnabled(true);
    renderFileFacts();
    renderSchemaList();
    renderMetadata();
    renderRowGroups();
    await runQuery({ silent: true });
    showToast('Parquet file opened.');
  } catch (error) {
    resetLoadedState();
    showToast(toErrorMessage(error), 'error');
    setStatus('Error', 'error');
  } finally {
    setBusy(false);
  }
}

async function loadFileProfile() {
  if (!state.activeFile || !state.virtualFileName) return;

  const filePath = quoteString(state.virtualFileName);
  const [schema, fileMeta, codecs, rowGroups] = await Promise.all([
    queryObjects(`DESCRIBE SELECT * FROM ${quoteIdentifier(TABLE_ALIAS)};`),
    optionalQueryObjects(`SELECT * FROM parquet_file_metadata(${filePath}) LIMIT 1;`),
    optionalQueryObjects(
      `SELECT compression, COUNT(*) AS column_chunks
       FROM parquet_metadata(${filePath})
       GROUP BY compression
       ORDER BY column_chunks DESC;`,
    ),
    optionalQueryObjects(
      `SELECT
          row_group_id,
          MAX(row_group_num_rows) AS rows,
          MAX(row_group_bytes) AS bytes,
          COUNT(*) AS column_chunks,
          STRING_AGG(DISTINCT compression, ', ') AS compression
       FROM parquet_metadata(${filePath})
       GROUP BY row_group_id
       ORDER BY row_group_id
       LIMIT 250;`,
    ),
  ]);

  state.schemaRows = schema.rows;
  state.fileMeta = fileMeta.rows[0] || null;
  state.codecs = codecs.rows;
  state.rowGroups = rowGroups.rows;
}

async function refreshMetadata() {
  if (!state.activeFile) return;
  setBusy(true, 'Refreshing metadata');
  try {
    await loadFileProfile();
    renderFileFacts();
    renderSchemaList();
    renderMetadata();
    renderRowGroups();
    showToast('Metadata refreshed.');
  } catch (error) {
    showToast(toErrorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

async function runQuery(options = {}) {
  if (!state.conn) return;

  const sql = el.sqlEditor.value.trim();
  if (!sql) {
    showToast('Enter a SQL query first.', 'error');
    return;
  }

  setBusy(true, options.silent ? 'Previewing rows' : 'Running query');
  const startedAt = performance.now();

  try {
    const result = await queryObjects(sql);
    const elapsed = Math.round(performance.now() - startedAt);
    state.resultColumns = result.columns;
    state.resultRows = result.rows;
    state.page = 0;
    renderResultTable();
    el.queryRuntime.textContent = `${formatNumber(result.rows.length)} row${result.rows.length === 1 ? '' : 's'} in ${elapsed} ms`;
    setStatus('Ready');
  } catch (error) {
    showToast(toErrorMessage(error), 'error');
    setStatus('Query error', 'error');
  } finally {
    setBusy(false);
  }
}

async function queryObjects(sql) {
  const table = await state.conn.query(sql);
  return arrowTableToObjects(table);
}

async function optionalQueryObjects(sql) {
  try {
    return await queryObjects(sql);
  } catch (error) {
    console.warn('Optional query failed:', sql, error);
    return { columns: [], rows: [] };
  }
}

function arrowTableToObjects(table) {
  const columns = Array.from(table?.schema?.fields || []).map((field) => field.name);
  const rows = Array.from(table?.toArray?.() || []).map((row) => {
    const raw = typeof row?.toJSON === 'function' ? row.toJSON() : row;
    const object = {};
    const keys = columns.length ? columns : Object.keys(raw || {});
    for (const key of keys) object[key] = raw?.[key];
    return object;
  });
  return { columns, rows };
}

function renderFileFacts() {
  const file = state.activeFile;
  const meta = state.fileMeta;
  const rows = pick(meta, 'num_rows');
  const rowGroups = (pick(meta, 'num_row_groups') ?? state.rowGroups.length) || null;
  const compression = state.codecs.map((row) => pick(row, 'compression')).filter(Boolean).join(', ');

  el.fileName.textContent = file?.name || 'No file';
  el.fileSize.textContent = file ? formatBytes(file.size) : '-';
  el.rowCount.textContent = rows != null ? formatNumber(rows) : '-';
  el.columnCount.textContent = state.schemaRows.length ? formatNumber(state.schemaRows.length) : '-';
  el.rowGroupCount.textContent = rowGroups != null ? formatNumber(rowGroups) : '-';
  el.compression.textContent = compression || '-';
}

function renderSchemaList() {
  const rows = state.schemaRows.filter((row) => {
    const name = String(pick(row, 'column_name', 'name') ?? '').toLowerCase();
    const type = String(pick(row, 'column_type', 'type') ?? '').toLowerCase();
    return !state.schemaFilter || name.includes(state.schemaFilter) || type.includes(state.schemaFilter);
  });

  el.schemaList.replaceChildren();

  if (!state.schemaRows.length) {
    el.schemaList.className = 'schema-list empty-state';
    el.schemaList.textContent = 'Open a file to view columns.';
    return;
  }

  if (!rows.length) {
    el.schemaList.className = 'schema-list empty-state';
    el.schemaList.textContent = 'No matching columns.';
    return;
  }

  el.schemaList.className = 'schema-list';
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'schema-item';

    const name = document.createElement('strong');
    name.title = String(pick(row, 'column_name', 'name') ?? '');
    name.textContent = String(pick(row, 'column_name', 'name') ?? '');

    const type = document.createElement('span');
    type.title = String(pick(row, 'column_type', 'type') ?? '');
    type.textContent = String(pick(row, 'column_type', 'type') ?? '');

    item.append(name, type);
    el.schemaList.append(item);
  }
}

function renderMetadata() {
  el.metadataList.replaceChildren();

  if (!state.activeFile) {
    el.metadataList.className = 'metadata-list empty-state';
    el.metadataList.textContent = 'Metadata appears after a file is opened.';
    return;
  }

  const meta = state.fileMeta || {};
  const items = [
    ['Virtual table', TABLE_ALIAS],
    ['Virtual file', state.virtualFileName || '-'],
    ['Last modified', state.activeFile.lastModified ? new Date(state.activeFile.lastModified).toLocaleString() : '-'],
    ['Created by', pick(meta, 'created_by') || '-'],
    ['Format version', pick(meta, 'format_version') ?? '-'],
    ['Encryption', pick(meta, 'encryption_algorithm') || 'None reported'],
  ];

  el.metadataList.className = 'metadata-list';
  for (const [label, value] of items) {
    const item = document.createElement('div');
    item.className = 'metadata-item';

    const key = document.createElement('span');
    key.textContent = label;

    const val = document.createElement('span');
    val.textContent = valueToDisplay(value);

    item.append(key, val);
    el.metadataList.append(item);
  }
}

function renderRowGroups() {
  el.rowGroupTable.replaceChildren();

  if (!state.rowGroups.length) {
    el.rowGroupSummary.textContent = '-';
    el.rowGroupTable.className = 'mini-table-wrap empty-state';
    el.rowGroupTable.textContent = 'No row group details.';
    return;
  }

  el.rowGroupSummary.textContent = `${formatNumber(state.rowGroups.length)} shown`;
  el.rowGroupTable.className = 'mini-table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const label of ['Group', 'Rows', 'Size', 'Compression']) {
    const th = document.createElement('th');
    th.textContent = label;
    tr.append(th);
  }
  thead.append(tr);

  const tbody = document.createElement('tbody');
  for (const row of state.rowGroups) {
    const group = pick(row, 'row_group_id');
    const rows = pick(row, 'rows');
    const bytes = pick(row, 'bytes');
    const compression = pick(row, 'compression');
    const trBody = document.createElement('tr');
    for (const value of [group, rows != null ? formatNumber(rows) : '-', bytes != null ? formatBytes(bytes) : '-', compression || '-']) {
      const td = document.createElement('td');
      td.textContent = valueToDisplay(value);
      trBody.append(td);
    }
    tbody.append(trBody);
  }

  table.append(thead, tbody);
  el.rowGroupTable.append(table);
}

function renderResultTable() {
  const rows = getFilteredRows();
  const columns = state.resultColumns;
  const totalRows = rows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / state.pageSize));
  state.page = Math.min(state.page, pageCount - 1);
  const start = state.page * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);

  el.tableWrap.replaceChildren();

  if (!columns.length && !pageRows.length) {
    el.tableWrap.className = 'table-wrap empty-table';
    const empty = document.createElement('div');
    empty.className = 'empty-state spacious';
    empty.innerHTML = '<strong>No rows returned</strong><span>Run another query or adjust the LIMIT.</span>';
    el.tableWrap.append(empty);
  } else {
    el.tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    for (const column of columns) {
      const th = document.createElement('th');
      th.title = column;
      th.textContent = column;
      headerRow.append(th);
    }
    thead.append(headerRow);

    const tbody = document.createElement('tbody');
    for (const row of pageRows) {
      const tr = document.createElement('tr');
      for (const column of columns) {
        const td = document.createElement('td');
        const value = row[column];
        if (value == null) td.classList.add('null-value');
        const span = document.createElement('span');
        span.className = 'table-cell-content';
        span.title = valueToDisplay(value);
        span.textContent = valueToDisplay(value);
        td.append(span);
        tr.append(td);
      }
      tbody.append(tr);
    }

    table.append(thead, tbody);
    el.tableWrap.append(table);
  }

  const rowWord = totalRows === 1 ? 'row' : 'rows';
  const colWord = columns.length === 1 ? 'column' : 'columns';
  el.resultSummary.textContent = `${formatNumber(totalRows)} ${rowWord}, ${formatNumber(columns.length)} ${colWord}`;
  el.pageInfo.textContent = totalRows ? `Page ${state.page + 1} of ${pageCount}` : 'Page 0 of 0';
  el.prevPageButton.disabled = !totalRows || state.page === 0;
  el.nextPageButton.disabled = !totalRows || state.page >= pageCount - 1;
  el.exportButton.disabled = !totalRows;
}

function getFilteredRows() {
  if (!state.resultFilter) return state.resultRows;
  return state.resultRows.filter((row) => {
    return state.resultColumns.some((column) => valueToDisplay(row[column]).toLowerCase().includes(state.resultFilter));
  });
}

function applyNextSampleQuery() {
  const filePath = state.virtualFileName ? quoteString(state.virtualFileName) : "'file.parquet'";
  const queries = [
    DEFAULT_QUERY,
    `DESCRIBE SELECT *\nFROM ${TABLE_ALIAS};`,
    `SUMMARIZE ${TABLE_ALIAS};`,
    `SELECT *\nFROM parquet_file_metadata(${filePath});`,
    `SELECT row_group_id, path_in_schema, compression, stats_min, stats_max, stats_null_count\nFROM parquet_metadata(${filePath})\nLIMIT 100;`,
  ];

  state.sampleIndex = (state.sampleIndex + 1) % queries.length;
  el.sqlEditor.value = queries[state.sampleIndex];
  el.sqlEditor.focus();
}

async function copySchemaSql() {
  if (!state.schemaRows.length) return;
  const body = state.schemaRows
    .map((row) => {
      const name = pick(row, 'column_name', 'name');
      const type = pick(row, 'column_type', 'type') || 'VARCHAR';
      return `  ${quoteIdentifier(String(name))} ${type}`;
    })
    .join(',\n');

  const sql = `CREATE TABLE ${quoteIdentifier(TABLE_ALIAS)} (\n${body}\n);`;
  await writeClipboard(sql);
  showToast('Schema SQL copied.');
}

function exportCsv() {
  const rows = getFilteredRows();
  if (!rows.length || !state.resultColumns.length) return;

  const csv = toCsv(state.resultColumns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `parqview-result-${stamp}.csv`);
}

async function clearFile() {
  if (state.conn) {
    try {
      await state.conn.query(`DROP VIEW IF EXISTS ${quoteIdentifier(TABLE_ALIAS)};`);
    } catch (error) {
      console.warn('Unable to drop view:', error);
    }
  }
  resetLoadedState();
  setControlsEnabled(false);
  setStatus(state.initialized ? 'DuckDB ready' : 'Ready');
}

function resetLoadedState() {
  state.activeFile = null;
  state.virtualFileName = null;
  state.fileMeta = null;
  state.schemaRows = [];
  state.rowGroups = [];
  state.codecs = [];
  state.resultColumns = [];
  state.resultRows = [];
  state.resultFilter = '';
  state.schemaFilter = '';
  state.page = 0;
  state.sampleIndex = 0;

  el.resultSearch.value = '';
  el.schemaSearch.value = '';
  el.sqlEditor.value = DEFAULT_QUERY;
  el.queryRuntime.textContent = 'No query yet';

  renderFileFacts();
  renderSchemaList();
  renderMetadata();
  renderRowGroups();
  renderResultTable();
}

function setControlsEnabled(enabled) {
  el.clearButton.disabled = !enabled;
  el.copySchemaButton.disabled = !enabled;
  el.schemaSearch.disabled = !enabled;
  el.sampleQueryButton.disabled = !enabled;
  el.runQueryButton.disabled = !enabled;
  el.pageSizeSelect.disabled = !enabled;
  el.resultSearch.disabled = !enabled;
  el.refreshMetadataButton.disabled = !enabled;
  el.exportButton.disabled = !enabled || !state.resultRows.length;
}

function setBusy(isBusy, label = 'Working') {
  state.isBusy = isBusy;
  if (isBusy) {
    setStatus(label, 'busy');
  } else if (!el.engineStatus.classList.contains('error')) {
    setStatus(state.initialized ? 'Ready' : 'Ready');
  }

  const enabled = Boolean(state.activeFile) && !isBusy;
  el.runQueryButton.disabled = !enabled;
  el.sampleQueryButton.disabled = !enabled;
  el.refreshMetadataButton.disabled = !enabled;
  el.copySchemaButton.disabled = !enabled;
  el.clearButton.disabled = !Boolean(state.activeFile) || isBusy;
  el.openFileButton.disabled = isBusy;
}

function setStatus(text, kind = '') {
  el.engineStatus.textContent = text;
  el.engineStatus.classList.toggle('busy', kind === 'busy');
  el.engineStatus.classList.toggle('error', kind === 'error');
}

function looksLikeParquet(file) {
  return /\.(parquet|parq)$/i.test(file.name);
}

function createVirtualFileName(name) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '') || 'data.parquet';
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `parqview_${id}_${safeName}`;
}

function quoteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function pick(row, ...names) {
  if (!row) return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  const lowerMap = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(String(name).toLowerCase());
    if (key) return row[key];
  }
  return undefined;
}

function valueToDisplay(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (ArrayBuffer.isView(value)) return bytesToHex(new Uint8Array(value.buffer));
  if (Array.isArray(value) || typeof value === 'object') return safeJson(value);
  return String(value);
}

function safeJson(value) {
  try {
    return JSON.stringify(value, (_key, innerValue) => (typeof innerValue === 'bigint' ? innerValue.toString() : innerValue));
  } catch {
    return String(value);
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .slice(0, 32)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function formatNumber(value) {
  if (value == null || value === '') return '-';
  if (typeof value === 'bigint') return value.toLocaleString();
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : String(value);
}

function formatBytes(value) {
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(number) || number < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = number;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unit]}`;
}

function toCsv(columns, rows) {
  const header = columns.map(escapeCsv).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}

function escapeCsv(value) {
  if (value == null) return '';
  const text = valueToDisplay(value).replaceAll('"', '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function writeClipboard(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is not available in this browser.');
  }
  await navigator.clipboard.writeText(text);
}

function showToast(message, type = '') {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', type === 'error');
  el.toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    el.toast.classList.remove('show');
  }, 3600);
}

function toErrorMessage(error) {
  const raw = error?.message || String(error);
  return raw.replace(/^Error:\s*/i, '').slice(0, 500);
}

function restoreTheme() {
  const saved = localStorage.getItem('parqview-theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
    return;
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('parqview-theme', next);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const swUrl = new URL('sw.js', window.location.href);
    await navigator.serviceWorker.register(swUrl, { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}
