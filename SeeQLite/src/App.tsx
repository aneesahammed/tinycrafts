import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { DatabaseClient } from './engine/database-client';
import type { Catalog, CatalogDetails, CatalogTable, QueryResult } from './engine/protocol';
import { checkCapabilities } from './platform/capabilities';
import { buildPlanNodes, planDepth } from './plan';
import { ErCanvas, MAX_DIAGRAM_TABLES, RelationshipList } from './components/ErCanvas';
import { buildJoinSql, formatSql, quoteIdentifier } from './sql';
const SqlEditor = lazy(() => import('./components/SqlEditor').then((module) => ({ default: module.SqlEditor })));

const SAMPLE_QUERY = 'SELECT 1 AS ready, sqlite_version() AS sqlite_version;';
const SOFT_FILE_LIMIT = 256 * 1024 * 1024;
const HARD_FILE_LIMIT = 512 * 1024 * 1024;
const SQLITE_SIDECAR_SUFFIXES = ['.sqlite-wal', '.sqlite-shm', '.sqlite-journal', '-wal', '-shm', '-journal'];
type AppSource = { kind: 'file'; file: File } | { kind: 'sample' };
type HistoryItem = { version: 1; sql: string; status: 'success' | 'error' | 'cancelled'; at: number; durationMs: number };
type TableDetailState = { status: 'loading' | 'ready' | 'error'; details?: CatalogDetails; message?: string };
type WorkspaceView = 'query' | 'schema' | 'diagram';
type SqlEditorFallbackProps = { value: string; onChange: (value: string) => void; onRun: () => void; onPlan: () => void; onFormat: () => void };
const HISTORY_KEY = 'seeqlite.query-history.v1';
const HISTORY_MAX_ITEMS = 100;
const HISTORY_MAX_SQL_BYTES = 8 * 1024;
const HISTORY_MAX_TOTAL_BYTES = 128 * 1024;
const CATALOG_PAGE_SIZE = 100;

function loadHistory(): HistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(value) ? boundHistory(value) : [];
  } catch {
    return [];
  }
}

function boundHistory(items: unknown[]): HistoryItem[] {
  const valid = items.flatMap((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as { sql?: unknown }).sql !== 'string') return [];
    const candidate = item as Partial<HistoryItem>;
    const sql = truncateUtf8(candidate.sql ?? '', HISTORY_MAX_SQL_BYTES);
    if (!sql) return [];
    return [{ version: 1 as const, sql, status: (candidate.status === 'success' || candidate.status === 'cancelled' ? candidate.status : 'error') as HistoryItem['status'], at: Number.isFinite(candidate.at) ? Number(candidate.at) : Date.now(), durationMs: Number.isFinite(candidate.durationMs) ? Math.max(0, Number(candidate.durationMs)) : 0 }];
  }).slice(0, HISTORY_MAX_ITEMS);
  while (valid.length && new TextEncoder().encode(JSON.stringify(valid)).byteLength > HISTORY_MAX_TOTAL_BYTES) valid.pop();
  return valid;
}

function truncateUtf8(value: string, maxBytes: number) {
  const encoded = new TextEncoder().encode(value);
  return encoded.byteLength <= maxBytes ? value : new TextDecoder().decode(encoded.slice(0, maxBytes));
}

function SqlEditorFallback({ value, onChange, onRun, onPlan, onFormat }: SqlEditorFallbackProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => () => {
    if (!restoreFocus.current && document.activeElement !== textarea.current) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="SQL query"]')?.focus());
  }, []);
  return <textarea ref={textarea} aria-label="SQL query" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyF') { event.preventDefault(); onFormat(); return; } if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return; restoreFocus.current = true; event.preventDefault(); if (event.shiftKey) onPlan(); else onRun(); }} spellCheck={false} />;
}

function RunIcon() {
  return <svg className="action-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 4 9 6-9 6V4Z" strokeLinejoin="round" /></svg>;
}

function ExplainIcon() {
  return <svg className="action-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7.1 3.4A7 7 0 0 0 3.5 9.5M3.5 9.5l2.8-1.7M3.5 9.5l1.7 2.8M12.9 16.6a7 7 0 0 0 3.6-6.1m0 0-2.8 1.7m2.8-1.7-1.7-2.8M10 3a7 7 0 0 1 5.8 3.1M10 17a7 7 0 0 1-5.8-3.1" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="10" r="2.1" /></svg>;
}

function FormatIcon() {
  return <svg className="action-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12" strokeLinecap="round" /><circle cx="8" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="13" cy="10" r="1.4" fill="currentColor" stroke="none" /><circle cx="6" cy="15" r="1.4" fill="currentColor" stroke="none" /></svg>;
}

export function App() {
  const client = useMemo(() => new DatabaseClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const dbMenuRef = useRef<HTMLDetailsElement>(null);
  const sourceRef = useRef<AppSource | null>(null);
  const capabilities = checkCapabilities();
  const [fileName, setFileName] = useState('No database open');
  const [query, setQuery] = useState(SAMPLE_QUERY);
  const [recoverableDraft, setRecoverableDraft] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(0);
  const [showInternalObjects, setShowInternalObjects] = useState(false);
  const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);
  const [tableDetails, setTableDetails] = useState<Record<string, TableDetailState>>({});
  const [view, setView] = useState<WorkspaceView>('query');
  const [status, setStatus] = useState('Choose a SQLite file. It stays in this browser tab.');
  const [busy, setBusy] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [planResult, setPlanResult] = useState<QueryResult | null>(null);
  const operationRef = useRef(0);
  const activeQueryRef = useRef<{ sql: string; started: number } | null>(null);
  const detailGenerationRef = useRef(0);
  const detailRequestsRef = useRef(new Set<string>());
  const queryRef = useRef(query);
  const previewSqlRef = useRef<string | null>(null);

  useEffect(() => () => client.terminate('SeeQLite was closed.'), [client]);
  useEffect(() => { document.documentElement.toggleAttribute('data-dark', darkTheme); }, [darkTheme]);
  useEffect(() => {
    const handleOfflineUnavailable = () => setStatus('Online only — this browser cannot store SeeQLite’s offline shell. Database work is still available.');
    window.addEventListener('seeqlite-offline-unavailable', handleOfflineUnavailable);
    return () => window.removeEventListener('seeqlite-offline-unavailable', handleOfflineUnavailable);
  }, []);

  function closeDbMenu() {
    if (dbMenuRef.current) dbMenuRef.current.open = false;
  }

  function invalidateDetails() {
    detailGenerationRef.current += 1;
    detailRequestsRef.current.clear();
    setTableDetails({});
  }

  function setEditorQuery(value: string) {
    queryRef.current = value;
    previewSqlRef.current = null;
    setRecoverableDraft(null);
    setQuery(value);
  }

  function formatEditorQuery() {
    const currentQuery = queryRef.current;
    if (!currentQuery.trim()) {
      setStatus('Write SQL before formatting.');
      return;
    }
    const formatted = formatSql(currentQuery);
    if (formatted === currentQuery) {
      setStatus('SQL is already formatted.');
      return;
    }
    setEditorQuery(formatted);
    setStatus('SQL formatted.');
  }

  function browseObject(table: CatalogTable) {
    const browseSql = `SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`;
    const currentQuery = queryRef.current;
    if (currentQuery !== browseSql && currentQuery !== SAMPLE_QUERY && currentQuery !== previewSqlRef.current) {
      setRecoverableDraft(currentQuery);
    }
    previewSqlRef.current = browseSql;
    queryRef.current = browseSql;
    setQuery(browseSql);
    setView('query');
    void runQuery(browseSql);
  }

  function restoreDraft() {
    if (recoverableDraft === null) return;
    previewSqlRef.current = null;
    queryRef.current = recoverableDraft;
    setQuery(recoverableDraft);
    setRecoverableDraft(null);
    setResult(null);
    setPlanResult(null);
    setStatus('SQL draft restored. Run it when ready.');
  }

  async function openBytes(bytes: ArrayBuffer, name: string, source: AppSource, notice = '') {
    sourceRef.current = source;
    setBusy(true);
    setFileName('No database open');
    setResult(null);
    setPlanResult(null);
    setCatalog(null);
    setCatalogSearch('');
    setCatalogPage(0);
    setShowInternalObjects(false);
    invalidateDetails();
    setSelectedTable(null);
    previewSqlRef.current = null;
    setRecoverableDraft(null);
    setStatus(`${notice ? `${notice} ` : ''}Opening a private, read-only database worker…`);
    try {
      if (new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\u0000') {
        throw new Error('That file does not have a readable SQLite 3 header.');
      }
      const walWarning = new Uint8Array(bytes.slice(0, 20))[18] === 2;
      const ready = await client.openBytes(bytes, name);
      setFileName(name);
      setCatalog(ready.catalog);
      setSelectedTable(null);
      setView('query');
      setStatus(`${ready.tableCount} table${ready.tableCount === 1 ? '' : 's'} ready${catalogLimitSuffix(ready.catalog)}. Run the sample query or write your own SELECT.${walWarning ? ' This file is WAL-mode; uncheckpointed sidecar changes may not be included.' : ''}`);
    } catch (error) {
      client.terminate('The database did not open.');
      setStatus(error instanceof Error ? error.message : 'Could not open that database.');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file: File) {
    if (isSQLiteSidecarName(file.name)) {
      setStatus('SQLite WAL, SHM, and journal sidecar files are not standalone databases. Choose the main database file.');
      return;
    }
    if (file.size > HARD_FILE_LIMIT) {
      setStatus('That file is over the 512 MB browser-safe limit and was not opened.');
      return;
    }
    const notice = file.size >= SOFT_FILE_LIMIT ? 'This file is over 256 MB; importing it may use substantial browser memory.' : '';
    await openBytes(await file.arrayBuffer(), file.name, { kind: 'file', file }, notice);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      setStatus(files.length > 1 ? 'Drop one SQLite file at a time.' : 'No file was dropped.');
      return;
    }
    void openFile(files[0]);
  }

  async function openSample() {
    sourceRef.current = { kind: 'sample' };
    setBusy(true);
    setFileName('No database open');
    setResult(null);
    setPlanResult(null);
    setCatalog(null);
    setCatalogSearch('');
    setCatalogPage(0);
    setShowInternalObjects(false);
    invalidateDetails();
    setSelectedTable(null);
    previewSqlRef.current = null;
    setRecoverableDraft(null);
    setStatus('Opening the bundled sample database…');
    try {
      const ready = await client.openSample('./sample.sqlite');
      setFileName(ready.fileName);
      setCatalog(ready.catalog);
      setSelectedTable(null);
      setView('query');
      setStatus(`${ready.tableCount} tables ready${catalogLimitSuffix(ready.catalog)}. Pick a table or write your own SELECT.`);
    } catch (error) {
      client.terminate('The sample database did not open.');
      setStatus(error instanceof Error ? error.message : 'Could not open the sample database.');
    } finally {
      setBusy(false);
    }
  }

  async function reopenDatabase() {
    const source = sourceRef.current;
    if (!source) return;
    if (source.kind === 'sample') return openSample();
    return openFile(source.file);
  }

  function resetWorkspace() {
    operationRef.current += 1;
    client.terminate('Workspace reset.');
    sourceRef.current = null;
    setFileName('No database open');
    setCatalog(null);
    setCatalogSearch('');
    setCatalogPage(0);
    setShowInternalObjects(false);
    invalidateDetails();
    setSelectedTable(null);
    setResult(null);
    setPlanResult(null);
    setView('query');
    setEditorQuery(SAMPLE_QUERY);
    setBusy(false);
    setStatus('Choose a SQLite file. It stays in this browser tab.');
  }

  async function runQuery(selectedSql?: string) {
    const sql = selectedSql?.trim() ? selectedSql : queryRef.current;
    const operation = ++operationRef.current;
    const started = performance.now();
    activeQueryRef.current = { sql, started };
    setPlanResult(null);
    setBusy(true);
    setStatus('Running in the SQLite worker…');
    try {
      const nextResult = await client.query(sql);
      if (operation !== operationRef.current) return;
      setResult(nextResult);
      addHistory({ sql, status: 'success', at: Date.now(), durationMs: performance.now() - started });
      setStatus(`${nextResult.returnedRows} row${nextResult.returnedRows === 1 ? '' : 's'} returned${nextResult.truncated ? ` (${truncationLabel(nextResult.truncationReason)})` : ''}.`);
    } catch (error) {
      if (operation !== operationRef.current) return;
      addHistory({ sql, status: 'error', at: Date.now(), durationMs: performance.now() - started });
      setStatus(error instanceof Error ? error.message : 'Query failed.');
    } finally {
      if (operation === operationRef.current) activeQueryRef.current = null;
      setBusy(false);
    }
  }

  async function runReadiness() {
    const operation = ++operationRef.current;
    const started = performance.now();
    activeQueryRef.current = { sql: 'SELECT 1 AS ready;', started };
    setPlanResult(null);
    setEditorQuery('SELECT 1 AS ready;');
    setBusy(true);
    setStatus('Running SELECT 1…');
    try {
      const nextResult = await client.query('SELECT 1 AS ready;');
      if (operation !== operationRef.current) return;
      setResult(nextResult);
      addHistory({ sql: 'SELECT 1 AS ready;', status: 'success', at: Date.now(), durationMs: performance.now() - started });
      setStatus(`${nextResult.returnedRows} row returned. SQLite is ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Readiness check failed.');
    } finally {
      if (operation === operationRef.current) activeQueryRef.current = null;
      setBusy(false);
    }
  }

  async function runPlan(selectedSql?: string) {
    const sql = selectedSql?.trim() ? selectedSql : queryRef.current;
    const operation = ++operationRef.current;
    const started = performance.now();
    setPlanResult(null);
    setBusy(true);
    setStatus('Explaining the query in the SQLite worker…');
    try {
      const nextPlan = await client.query(/^explain\s+query\s+plan\b/i.test(sql) ? sql : `EXPLAIN QUERY PLAN ${sql}`);
      if (operation !== operationRef.current) return;
      setPlanResult(nextPlan);
      setStatus(`Query plan ready in ${Math.round(performance.now() - started)} ms.`);
    } catch (error) {
      if (operation !== operationRef.current) return;
      setStatus(error instanceof Error ? error.message : 'Could not create a query plan.');
    } finally {
      if (operation === operationRef.current) setBusy(false);
    }
  }

  function addHistory(item: Omit<HistoryItem, 'version'>) {
    setHistory((current) => {
      const next = boundHistory([{ version: 1, ...item }, ...current]);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage is optional */ }
      return next;
    });
  }

  function clearHistory() {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage is optional */ }
  }

  function cancelQuery() {
    const active = activeQueryRef.current;
    operationRef.current += 1;
    activeQueryRef.current = null;
    if (active) addHistory({ sql: active.sql, status: 'cancelled', at: Date.now(), durationMs: performance.now() - active.started });
    client.terminate('Query stopped.');
    setBusy(false);
    setFileName('No database open');
    setCatalog(null);
    setResult(null);
    setPlanResult(null);
    setShowInternalObjects(false);
    invalidateDetails();
    setStatus('Query stopped. Reopen the database to continue.');
  }

  async function selectTable(table: CatalogTable, { browse = false }: { browse?: boolean } = {}) {
    setSelectedTable(table);
    if (browse) browseObject(table);
    const existing = tableDetails[table.name];
    if (existing?.status === 'ready' || detailRequestsRef.current.has(table.name)) return;
    const generation = detailGenerationRef.current;
    detailRequestsRef.current.add(table.name);
    setTableDetails((current) => ({ ...current, [table.name]: { status: 'loading' } }));
    try {
      const details = await client.details(table.name);
      if (generation !== detailGenerationRef.current) return;
      setTableDetails((current) => ({ ...current, [table.name]: { status: 'ready', details } }));
    } catch (error) {
      if (generation !== detailGenerationRef.current) return;
      detailRequestsRef.current.delete(table.name);
      setTableDetails((current) => ({ ...current, [table.name]: { status: 'error', message: error instanceof Error ? error.message : 'This object’s index details could not be loaded.' } }));
    }
  }

  function generateJoin(relation: Catalog['foreignKeys'][number]) {
    if (!catalog) return;
    const sql = buildJoinSql(relation, catalog);
    if (!sql) {
      setStatus('This relationship cannot generate a join because its referenced table or columns are unresolved.');
      return;
    }
    if (queryRef.current.trim() && !window.confirm('Replace the current SQL draft with this generated read-only join?')) return;
    setEditorQuery(sql);
    setView('query');
    setStatus('Generated a quoted read-only join. Review it, then run the query.');
  }

  const visibleCatalog = useMemo(() => {
    if (!catalog || showInternalObjects) return catalog;
    const tables = catalog.tables.filter((table) => !table.internal);
    const tableByName = new Map(catalog.tables.map((table) => [table.name, table]));
    return { ...catalog, tables, foreignKeys: catalog.foreignKeys.filter((relation) => !tableByName.get(relation.fromTable)?.internal && !tableByName.get(relation.toTable)?.internal) };
  }, [catalog, showInternalObjects]);

  const filteredTables = useMemo(() => {
    const needle = catalogSearch.trim().toLowerCase();
    if (!visibleCatalog || !needle) return visibleCatalog?.tables ?? [];
    return visibleCatalog.tables.filter((table) => table.name.toLowerCase().includes(needle) || table.kind.toLowerCase().includes(needle) || table.columns.some((column) => column.name.toLowerCase().includes(needle)));
  }, [visibleCatalog, catalogSearch]);

  const catalogPageCount = Math.max(1, Math.ceil(filteredTables.length / CATALOG_PAGE_SIZE));
  const currentCatalogPage = Math.min(catalogPage, catalogPageCount - 1);
  const visibleTables = filteredTables.slice(currentCatalogPage * CATALOG_PAGE_SIZE, (currentCatalogPage + 1) * CATALOG_PAGE_SIZE);
  const visibleTableObjects = visibleTables.filter((table) => table.kind !== 'view');
  const visibleViewObjects = visibleTables.filter((table) => table.kind === 'view');

  useEffect(() => {
    if (selectedTable?.internal && !showInternalObjects) setSelectedTable(null);
  }, [selectedTable, showInternalObjects]);
  useEffect(() => { setCatalogPage(0); }, [catalogSearch, showInternalObjects, catalog]);

  const databaseObjects = catalog?.tables.filter((table) => !table.internal) ?? [];
  const databaseTableCount = databaseObjects.filter((table) => table.kind === 'table' || table.kind === 'virtual').length;
  const databaseViewCount = databaseObjects.filter((table) => table.kind === 'view').length;
  const dbStats = catalog ? `${databaseTableCount} table${databaseTableCount === 1 ? '' : 's'} · ${databaseViewCount} view${databaseViewCount === 1 ? '' : 's'} · ${catalog.foreignKeys.length} relation${catalog.foreignKeys.length === 1 ? '' : 's'}${result ? ` · ${result.returnedRows} row${result.returnedRows === 1 ? '' : 's'}` : ''}` : '';

  return (
    <div className="app-shell" data-skin="app">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <header className="app-header">
        <a className="brand" href="../../index.htm" aria-label="TinyCrafts home">
          <img className="brand-mark" src="./seeqlite-icon.svg" alt="" />
          <span><strong>SeeQLite</strong><small>SQLite, in your browser</small></span>
        </a>
        <div className="file-status">
          {catalog ? (
            <details className="db-menu" ref={dbMenuRef}>
              <summary className="db-pill" aria-label={`Database ${fileName}. Open database menu`}>
                <span className={busy ? 'db-dot busy' : 'db-dot ok'} aria-hidden="true" />
                <strong dir="auto" title={fileName}>{fileName}</strong>
                <span className="db-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="db-menu-list">
                {capabilities.ok ? <button className="db-menu-item" onClick={() => { closeDbMenu(); fileInput.current?.click(); }} disabled={busy}>Open another database</button> : null}
                <button className="db-menu-item" onClick={() => { closeDbMenu(); void runReadiness(); }} disabled={busy}>Run readiness check</button>
                <button className="db-menu-item" onClick={() => { closeDbMenu(); resetWorkspace(); }} disabled={busy}>Close database</button>
              </div>
            </details>
          ) : <strong className="db-none"><span aria-hidden="true">Open a database</span><span className="sr-only">No database open</span></strong>}
          {sourceRef.current && fileName === 'No database open' ? <button className="secondary-button compact" onClick={reopenDatabase} disabled={busy}>Reopen database</button> : null}
          <span className="db-status sr-only" title={status}>{status}</span>
        </div>
        {catalog ? <span className="header-stats" aria-hidden="true">{dbStats}</span> : null}
        <div className="topbar-meta">
          <button className="theme-button" aria-pressed={darkTheme} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDarkTheme((value) => !value)}>{darkTheme ? 'Light' : 'Dark'}</button>
        </div>
        <input ref={fileInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" hidden onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0])} />
      </header>

      <main id="workspace" className="workbench" tabIndex={-1} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        {catalog ? (
          <>
            <aside className="catalog-rail" aria-label="Explorer">
              <div className="rail-title"><h2>Explorer</h2><button className="rail-filter" type="button" aria-pressed={showInternalObjects} onClick={() => setShowInternalObjects((value) => !value)}><span>{showInternalObjects ? 'Hide internal' : 'Show internal'}</span><span className="sr-only"> objects</span></button></div>
              <label className="catalog-search"><span className="search-glyph" aria-hidden="true"><SearchIcon /></span><input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search tables or views" aria-label="Search tables and columns" autoComplete="off" /></label>
              <div className="table-list">
                {visibleTableObjects.length ? <div className="object-group"><div className="group-heading"><span>Tables</span><span>{visibleTableObjects.length}</span></div>{visibleTableObjects.map((table) => <ObjectListItem key={table.name} table={table} selected={selectedTable?.name === table.name} onSelect={() => void selectTable(table, { browse: true })} disabled={busy} />)}</div> : null}
                {visibleViewObjects.length ? <div className="object-group"><div className="group-heading"><span>Views</span><span>{visibleViewObjects.length}</span></div>{visibleViewObjects.map((table) => <ObjectListItem key={table.name} table={table} selected={selectedTable?.name === table.name} onSelect={() => void selectTable(table, { browse: true })} disabled={busy} />)}</div> : null}
              </div>
              {catalogPageCount > 1 ? <div className="catalog-pagination" role="navigation" aria-label="Catalog page controls"><button className="quiet-button" onClick={() => setCatalogPage((page) => Math.max(0, page - 1))} disabled={currentCatalogPage === 0}>Prev</button><span aria-live="polite">Page {currentCatalogPage + 1} of {catalogPageCount}</span><button className="quiet-button" onClick={() => setCatalogPage((page) => Math.min(catalogPageCount - 1, page + 1))} disabled={currentCatalogPage >= catalogPageCount - 1}>Next</button></div> : null}
              {filteredTables.length === 0 ? <p className="catalog-empty">{(visibleCatalog?.tables.length ?? 0) === 0 ? 'No visible tables or views were found in this database.' : <>No objects match <code>{catalogSearch}</code>.</>}</p> : null}
              {catalog.limits.length ? <p className="catalog-limit" role="status">Catalog is limited: {catalogLimitText(catalog.limits)}. Search and read-only queries remain available; the ER diagram is paused.</p> : null}
              <div className="rail-footer"><button className="quiet-button rail-open" onClick={() => fileInput.current?.click()} disabled={busy}>Open another database</button><span>{catalogSearch.trim() ? `${filteredTables.length} match${filteredTables.length === 1 ? '' : 'es'}` : `${visibleCatalog?.tables.length ?? 0} objects`}</span></div>
            </aside>

            <section className="work-main" aria-label="Query workspace">
              <div className="mode-tabs" role="tablist" aria-label="Database workspace view">
                <button id="query-tab" className={view === 'query' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-controls="query-panel" aria-selected={view === 'query'} onClick={() => setView('query')}>Query</button>
                <button id="schema-tab" className={view === 'schema' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-controls="schema-panel" aria-selected={view === 'schema'} onClick={() => setView('schema')}>Schema</button>
                <button id="diagram-tab" className={view === 'diagram' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-controls="diagram-panel" aria-selected={view === 'diagram'} disabled={Boolean(catalog.limits.length) || catalog.tables.length > MAX_DIAGRAM_TABLES} title={catalog.tables.length > MAX_DIAGRAM_TABLES ? `The ER diagram is limited to ${MAX_DIAGRAM_TABLES} tables.` : catalog.limits.length ? 'The catalog is limited; open a smaller database to see the diagram.' : undefined} onClick={() => setView('diagram')}>ER Diagram</button>
              </div>
              {view === 'query' ? (
                <div id="query-panel" className="editor-tab" role="tabpanel" aria-labelledby="query-tab">
                  <div className="editor-pane">
                    <Suspense fallback={<SqlEditorFallback value={query} onChange={setEditorQuery} onRun={() => void runQuery()} onPlan={() => void runPlan()} onFormat={formatEditorQuery} />}><SqlEditor value={query} catalog={catalog} onChange={setEditorQuery} onRun={runQuery} onPlan={runPlan} onFormat={formatEditorQuery} /></Suspense>
                    <div className="query-actions">
                      <button className="primary-button compact toolbar-action run-action" onClick={() => runQuery()} disabled={busy}><RunIcon /><span>{busy ? 'Running…' : 'Run query'}</span><kbd className="kbd" aria-hidden="true">⌘↵</kbd></button>
                      {busy ? <button className="secondary-button compact" onClick={cancelQuery}>Stop running query</button> : null}
                      <button className="secondary-button compact toolbar-action" onClick={() => runPlan()} disabled={busy}><ExplainIcon /><span>Explain</span><kbd className="kbd" aria-hidden="true">⌘⇧↵</kbd></button>
                      <button className="secondary-button compact toolbar-action" onClick={formatEditorQuery} disabled={busy} title="Format SQL (⌥F)"><FormatIcon /><span>Format</span><kbd className="kbd" aria-hidden="true">⌥F</kbd></button>
                      {recoverableDraft !== null ? <button className="quiet-button draft-restore" onClick={restoreDraft} disabled={busy}>Restore SQL draft</button> : null}
                      <span className="query-status" role="status" aria-live="polite">{status}</span>
                    </div>
                  </div>
                  <div className="output-pane">
                    <div className="result-panel" role="region" aria-label="Query results">
                      <div className="result-heading"><span className="label">Results</span><span className="result-status"><span className={busy ? 'dot busy' : result ? 'dot ok' : 'dot'} aria-hidden="true" />{busy ? 'Running…' : result ? `${result.returnedRows} row${result.returnedRows === 1 ? '' : 's'} · ${result.columns.length} col${result.columns.length === 1 ? '' : 's'}` : 'Ready'}</span><span className="result-meta">{result?.truncated ? truncationLabel(result.truncationReason) : ''}</span></div>
                      {result ? <ResultTable result={result} /> : <div className="empty-result"><span className="empty-glyph" aria-hidden="true">⌁</span><p>Select a table to inspect it, or run a SELECT.</p></div>}
                    </div>
                    {planResult ? <div className="result-panel plan-panel"><div className="result-heading"><span className="label">QUERY PLAN</span><button className="quiet-button" onClick={() => setPlanResult(null)}>Hide query plan</button></div><PlanTree result={planResult} /></div> : null}
                    {result ? <div className="export-actions"><span className="label">EXPORT RESULT</span><button className="quiet-button" onClick={() => downloadResult(result, 'csv')}>Download CSV</button><button className="quiet-button" onClick={() => downloadResult(result, 'json')}>Download JSON</button></div> : null}
                    <QueryHistory items={history} onChoose={setEditorQuery} onDelete={(at) => { const next = history.filter((item) => item.at !== at); setHistory(next); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage is optional */ } }} onClear={clearHistory} />
                  </div>
                </div>
              ) : view === 'schema' ? (
                <div id="schema-panel" className="schema-pane" role="tabpanel" aria-labelledby="schema-tab">
                  {selectedTable ? <TableDetails table={selectedTable} catalog={catalog} detail={tableDetails[selectedTable.name]} /> : <div className="schema-empty"><span className="empty-glyph" aria-hidden="true">▤</span><p>Select a table on the left to inspect its columns, indexes, and keys.</p></div>}
                </div>
              ) : (
                <div id="diagram-panel" className="diagram-panel" role="tabpanel" aria-labelledby="diagram-tab"><ErCanvas catalog={visibleCatalog} selectedTableName={selectedTable?.name ?? null} onSelectTable={(table) => void selectTable(table)} /></div>
              )}
            </section>
            <aside className="inspector-rail" aria-label="Object inspector">
              <div className="inspector-heading"><span className="label">{view === 'diagram' ? 'Relationships' : 'Inspector'}</span><h2>{view === 'diagram' ? 'Declared relationships' : selectedTable ? selectedTable.name : 'Nothing selected'}</h2>{selectedTable && view !== 'diagram' ? <span className="inspector-kind">{selectedTable.kind}</span> : null}</div>
              {view === 'diagram' ? <RelationshipList catalog={visibleCatalog ?? catalog} selected={selectedTable?.name ?? null} onSelectTable={(table) => void selectTable(table)} onGenerateJoin={generateJoin} /> : selectedTable ? view === 'schema' ? <InspectorSummary table={selectedTable} onOpenQuery={() => setView('query')} /> : <TableDetails table={selectedTable} catalog={catalog} detail={tableDetails[selectedTable.name]} /> : <div className="inspector-empty"><span className="empty-glyph" aria-hidden="true">◎</span><p>Select a table to see its columns, indexes, and relationships here.</p></div>}
            </aside>
          </>
        ) : (
          <>
            <aside className="catalog-rail empty-rail" aria-label="Explorer"><div className="rail-title"><h2>Explorer</h2></div><div className="empty-rail-content"><span className="empty-glyph" aria-hidden="true">▦</span><p>Open a database to browse its tables, views, and relationships.</p></div><div className="rail-footer"><button className="quiet-button rail-open" onClick={() => fileInput.current?.click()} disabled={busy}>New database</button></div></aside>
            <section className="work-main empty-workspace" aria-label="Database workspace"><div className="empty-workspace-toolbar"><span className="label">Workspace</span><span>Local SQLite</span></div><div className="empty-workspace-body"><p className="eyebrow">Ready when you are</p><h1>Open a SQLite database</h1><p className="lede">Explore its shape, run read-only SQL, and understand relationships without uploading a byte.</p><div className="privacy-note"><span className="status-dot" /> No server. No account. Your database stays in this browser tab.</div>{!capabilities.ok ? <div className="callout error" role="alert"><strong>Browser capability missing</strong><p>This browser needs {capabilities.missing.join(', ')} to run SeeQLite locally.</p></div> : <div className="open-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}><div className="open-actions"><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Working…' : 'Open SQLite database'}</button><button className="secondary-button" onClick={openSample} disabled={busy}>Try sample database</button></div><p className="helper">SQLite 3 files up to 512 MB. Drop one file anywhere in this workspace.</p></div>}<p className="intake-status" role="status" aria-live="polite">{status}</p></div></section>
            <aside className="inspector-rail empty-inspector" aria-label="Object inspector"><div className="inspector-heading"><span className="label">Inspector</span><h2>Nothing selected</h2></div><div className="inspector-empty"><span className="empty-glyph" aria-hidden="true">◎</span><p>After you choose a table, its columns, indexes, and relationships will appear here.</p></div></aside>
          </>
        )}
      </main>
    </div>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="5.8" /><path d="m16 16 4 4" /></svg>;
}

function ObjectIcon({ kind }: { kind: CatalogTable['kind'] }) {
  if (kind === 'view') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 10h16M10 4v16" /></svg>;
}

function ObjectListItem({ table, selected, onSelect, disabled }: { table: CatalogTable; selected: boolean; onSelect: () => void; disabled: boolean }) {
  return <button className={selected ? 'table-list-item active' : 'table-list-item'} onClick={onSelect} disabled={disabled} aria-current={selected ? 'page' : undefined}>
    <span className="table-glyph" aria-hidden="true"><ObjectIcon kind={table.kind} /></span>
    <span className="table-list-name">{table.name}</span>
    <span className="sr-only">{table.internal ? 'internal ' : ''}{table.kind}{table.warnings?.length ? ' limited' : ''}</span>
    <span className="table-list-count" aria-hidden="true">{table.columns.length}</span>
  </button>;
}

function InspectorSummary({ table, onOpenQuery }: { table: CatalogTable; onOpenQuery: () => void }) {
  return <div className="inspector-summary"><p>The complete schema is open in the center workspace.</p><dl><div><dt>Type</dt><dd>{table.kind}</dd></div><div><dt>Columns</dt><dd>{table.columns.length}</dd></div><div><dt>Storage</dt><dd>{table.withoutRowid ? 'Without rowid' : 'Rowid table'}</dd></div></dl><div className="summary-actions"><button className="quiet-button" onClick={onOpenQuery}>Return to query</button></div></div>;
}

function catalogLimitText(limits: Catalog['limits']) {
  return limits.map((limit) => `${limit.kind} capped at ${limit.limit.toLocaleString()}`).join(' · ');
}

function catalogLimitSuffix(catalog: Catalog) {
  return catalog.limits.length ? `; Catalog limited (${catalogLimitText(catalog.limits)})` : '';
}

function isSQLiteSidecarName(name: string) {
  const lowerName = name.toLowerCase();
  return SQLITE_SIDECAR_SUFFIXES.some((suffix) => lowerName.endsWith(suffix));
}

function TableDetails({ table, catalog, detail }: { table: CatalogTable; catalog: Catalog | null; detail?: TableDetailState }) {
  const relationships = catalog?.foreignKeys.filter((relation) => relation.fromTable === table.name || relation.toTable === table.name) ?? [];
  const [copyState, setCopyState] = useState<'idle' | 'identifier' | 'select' | 'error'>('idle');
  async function copy(value: string, kind: 'identifier' | 'select') {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(value);
      else if (!copyWithSelection(value)) throw new Error('Clipboard unavailable');
      setCopyState(kind);
    } catch {
      setCopyState(copyWithSelection(value) ? kind : 'error');
    }
  }
  const indexes = detail?.status === 'ready' ? detail.details?.indexes ?? [] : [];
  const uniqueColumns = new Set(indexes.filter((index) => index.unique && index.columns.length === 1 && index.columns[0].name && !index.columns[0].expression).map((index) => index.columns[0].name!));
  const foreignKeyColumns = new Set(relationships.filter((relation) => relation.fromTable === table.name).flatMap((relation) => relation.fromColumns));
  return <section className="table-details" aria-label={`${table.name} details`}><div className="result-heading"><span className="label">Object details</span><strong>{table.name}</strong><div className="detail-actions"><button className="quiet-button" onClick={() => copy(quoteIdentifier(table.name), 'identifier')}>Copy identifier</button><button className="quiet-button" onClick={() => copy(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`, 'select')}>Copy SELECT</button></div></div>{copyState !== 'idle' ? <p className={copyState === 'error' ? 'copy-status error' : 'copy-status'} role="status" aria-live="polite">{copyState === 'error' ? 'Clipboard access was denied. Select the text from the editor instead.' : `Copied ${copyState === 'identifier' ? 'the quoted identifier' : 'a safe SELECT statement'}.`}</p> : null}{table.warnings?.length ? <p className="detail-error" role="status">{tableWarningText(table.warnings)}</p> : null}<div className="object-meta"><span>{table.internal ? 'INTERNAL' : table.kind.toUpperCase()}</span><span>{table.withoutRowid ? 'WITHOUT ROWID' : 'ROWID'}</span><span>{table.strict ? 'STRICT' : 'NORMAL AFFINITY'}</span></div><div className="detail-grid"><div><h3>Columns</h3>{table.columns.length ? <ul>{table.columns.map((column) => <li key={column.name}><code>{column.name}</code><span>{column.type || 'ANY'}{column.primaryKey ? ' · PK' : ''}{column.notNull ? ' · NOT NULL' : ''}{uniqueColumns.has(column.name) ? ' · UNIQUE' : ''}{foreignKeyColumns.has(column.name) ? ' · FK' : ''}{column.defaultValue !== null ? ` · DEFAULT ${column.defaultValue}` : ''}{columnVisibility(column)}</span></li>)}</ul> : <p className="detail-loading">Column metadata is unavailable for this object; its name and safe query action remain available.</p>}</div><div><h3>Indexes</h3>{!detail || detail.status === 'loading' ? <p className="detail-loading" role="status">Loading index details…</p> : detail.status === 'error' ? <p className="detail-error" role="status">{detail.message}</p> : <ul>{indexes.length ? indexes.map((index) => <li key={index.name}><code>{index.name}</code><span>{indexOrigin(index.origin)}{index.unique ? ' · UNIQUE' : ''}{index.partial ? ' · PARTIAL' : ''}{index.predicate ? ` · WHERE ${index.predicate}` : ''} · {index.columns.map(formatIndexColumn).join(', ') || 'rowid'}</span></li>) : <li><span>No explicit indexes</span></li>}</ul>}<h3>Relationships</h3><ul>{relationships.length ? relationships.map((relation) => <li key={`${relation.fromTable}-${relation.id}-${relation.toTable}`}><code>{relation.fromTable === table.name ? relation.fromColumns.join(', ') : relation.toColumns.join(', ')}</code><span>→ {relation.fromTable === table.name ? relation.toTable : relation.fromTable}</span></li>) : <li><span>No declared foreign keys</span></li>}</ul></div></div>{table.schemaSql ? <details className="schema-details"><summary>Show CREATE SQL</summary><pre>{table.schemaSql}</pre></details> : null}</section>;
}

function tableWarningText(warnings: NonNullable<CatalogTable['warnings']>) {
  return warnings.map((warning) => warning === 'columns-unavailable' ? 'Column metadata could not be read for this object.' : warning === 'columns-limited' ? 'Column metadata is limited by the browser catalog budget.' : 'Foreign-key metadata could not be read for this object.').join(' ');
}

function columnVisibility(column: CatalogTable['columns'][number]) {
  if (column.hidden === 1) return ' · HIDDEN';
  if (column.hidden === 2) return ' · GENERATED VIRTUAL';
  if (column.hidden === 3) return ' · GENERATED STORED';
  return '';
}

function indexOrigin(origin: CatalogTable['indexes'][number]['origin']) {
  if (origin === 'primary-key') return 'PRIMARY KEY';
  if (origin === 'unique') return 'UNIQUE';
  if (origin === 'created') return 'INDEX';
  return 'INDEX';
}

function formatIndexColumn(column: CatalogTable['indexes'][number]['columns'][number]) {
  if (column.expression) return `expression${column.descending ? ' DESC' : ''}`;
  return `${column.name ?? 'rowid'}${column.descending ? ' DESC' : ''}`;
}

function copyWithSelection(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  textarea.remove();
  return copied;
}

function ResultTable({ result }: { result: QueryResult }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ index: number; direction: 'asc' | 'desc' } | null>(null);
  const pageSize = 50;
  const sortedRows = useMemo(() => {
    if (!sort) return result.rows;
    return [...result.rows].sort((left, right) => compareValues(left[sort.index], right[sort.index]) * (sort.direction === 'asc' ? 1 : -1));
  }, [result.rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = sortedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const start = sortedRows.length === 0 ? 0 : currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, sortedRows.length);
  return <>
    <div className="table-wrap"><table><caption className="sr-only">Query result</caption><thead><tr>{result.columns.map((column, index) => { const label = column.name || `column_${index + 1}`; const active = sort?.index === index; return <th scope="col" key={`${column.name}-${index}`}><button className="column-sort" onClick={() => { const direction = active && sort.direction === 'asc' ? 'desc' : 'asc'; setSort({ index, direction }); setPage(0); }} aria-label={`Sort by ${label}`} aria-pressed={active}>{label}{active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>; })}</tr></thead><tbody>{visibleRows.map((row, rowIndex) => <tr key={`${currentPage}-${rowIndex}`}>{row.map((value, index) => <td key={index}>{formatValue(value)}</td>)}</tr>)}</tbody></table></div>
    <div className="result-pagination" aria-label="Result page controls"><span>Showing {start}–{end} of {sortedRows.length} returned rows{sort ? ' · sorted in browser' : ''}{result.truncated ? ` · ${truncationLabel(result.truncationReason)}` : ''}</span><div><button className="quiet-button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>Previous</button><span aria-live="polite">Page {currentPage + 1} of {pageCount}</span><button className="quiet-button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1}>Next</button></div></div>
  </>;
}

function PlanTree({ result }: { result: QueryResult }) {
  const nodes = buildPlanNodes(result);
  const positions = new Map(nodes.map((node, index) => [node.id, index]));
  return <div className="plan-tree" role="list" aria-label="SQLite query plan">{nodes.length ? nodes.map((node, index) => <div className="plan-item" role="listitem" key={`${node.id}-${index}`} style={{ marginLeft: `${planDepth(node, positions, nodes)}rem` }}><span className="plan-marker" aria-hidden="true">↳</span><span className="plan-detail">{node.detail}</span></div>) : <p className="plan-empty">SQLite returned no plan steps.</p>}</div>;
}

function QueryHistory({ items, onChoose, onDelete, onClear }: { items: HistoryItem[]; onChoose: (sql: string) => void; onDelete: (at: number) => void; onClear: () => void }) {
  return <details className="history-panel"><summary>Query history <span>{items.length}</span></summary>{items.length === 0 ? <p className="history-empty">Successful, failed, and cancelled SQL stays here only as bounded UI history.</p> : <><div className="history-actions"><button className="quiet-button" onClick={onClear}>Clear query history</button></div><div className="history-list">{items.map((item, index) => <div key={`${item.at}-${index}`} className="history-item"><button className="history-open" onClick={() => onChoose(item.sql)}><span className={item.status === 'success' ? 'history-status success' : item.status === 'cancelled' ? 'history-status cancelled' : 'history-status error'}>{item.status}</span><code>{item.sql}</code><small>{Math.round(item.durationMs)} ms</small></button><button className="quiet-button history-delete" onClick={() => onDelete(item.at)} aria-label={`Delete history entry ${index + 1}`}>Delete</button></div>)}</div></>}</details>;
}

function downloadResult(result: QueryResult, format: 'csv' | 'json') {
  const headers = result.columns.map((column, index) => column.name || `column_${index + 1}`);
  const body = format === 'csv'
    ? [headers.map(protectCsvFormula), ...result.rows.map((row) => row.map(csvValue))].map((row) => row.map(csvEscape).join(',')).join('\n')
    : JSON.stringify({ columns: headers, rows: result.rows.map((row) => row.map(jsonValue)), returnedRows: result.returnedRows, truncated: result.truncated, truncationReason: result.truncationReason ?? null }, null, 2);
  const blob = new Blob([body], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `seeqlite-result.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvValue(value: QueryResult['rows'][number][number]) {
  if (value === null) return '';
  if (typeof value === 'object' && value.kind === 'text') return protectCsvFormula(`${value.value}${value.truncated ? ` [text preview of ${value.bytes} bytes]` : ''}`);
  if (typeof value === 'object') return `BLOB (${value.bytes} bytes)${value.preview ? ` ${value.preview}` : ''}`;
  return typeof value === 'string' ? protectCsvFormula(value) : String(value);
}

function protectCsvFormula(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function jsonValue(value: QueryResult['rows'][number][number]) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object' && value !== null) return { ...value };
  return value;
}

function formatValue(value: QueryResult['rows'][number][number]) {
  if (value === null) return <span className="null-value">NULL</span>;
  if (typeof value === 'object' && value.kind === 'text') return <span title={`${value.bytes} UTF-8 bytes`}>{value.value}{value.truncated ? ' …' : ''}</span>;
  if (typeof value === 'object') return <span className="blob-value">BLOB · {value.bytes} bytes{value.truncated ? ' · preview' : ''}</span>;
  return String(value);
}

function compareValues(left: QueryResult['rows'][number][number], right: QueryResult['rows'][number][number]) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const leftValue = typeof left === 'object' && left.kind === 'text' ? left.value : typeof left === 'object' ? left.bytes : left;
  const rightValue = typeof right === 'object' && right.kind === 'text' ? right.value : typeof right === 'object' ? right.bytes : right;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' });
}

function truncationLabel(reason: QueryResult['truncationReason']) {
  if (reason === 'cell-limit') return 'cell limit reached';
  if (reason === 'byte-limit') return '8 MB result limit reached';
  return 'row display capped at 1,000';
}
