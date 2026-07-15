import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { DatabaseClient } from './engine/database-client';
import type { Catalog, CatalogTable, QueryResult } from './engine/protocol';
import { checkCapabilities } from './platform/capabilities';
const SqlEditor = lazy(() => import('./components/SqlEditor').then((module) => ({ default: module.SqlEditor })));

const SAMPLE_QUERY = 'SELECT 1 AS ready, sqlite_version() AS sqlite_version;';
const SOFT_FILE_LIMIT = 256 * 1024 * 1024;
const HARD_FILE_LIMIT = 512 * 1024 * 1024;
const SQLITE_SIDECAR_SUFFIXES = ['.sqlite-wal', '.sqlite-shm', '.sqlite-journal', '-wal', '-shm', '-journal'];
type AppSource = { kind: 'file'; file: File } | { kind: 'sample' };
type HistoryItem = { version: 1; sql: string; status: 'success' | 'error' | 'cancelled'; at: number; durationMs: number };
const HISTORY_KEY = 'seeqlite.query-history.v1';
const HISTORY_MAX_ITEMS = 100;
const HISTORY_MAX_SQL_BYTES = 8 * 1024;
const HISTORY_MAX_TOTAL_BYTES = 128 * 1024;

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

export function App() {
  const client = useMemo(() => new DatabaseClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<AppSource | null>(null);
  const capabilities = checkCapabilities();
  const [fileName, setFileName] = useState('No database open');
  const [query, setQuery] = useState(SAMPLE_QUERY);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showInternalObjects, setShowInternalObjects] = useState(false);
  const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);
  const [view, setView] = useState<'query' | 'diagram'>('query');
  const [status, setStatus] = useState('Choose a SQLite file. It stays in this browser tab.');
  const [busy, setBusy] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [planResult, setPlanResult] = useState<QueryResult | null>(null);
  const operationRef = useRef(0);
  const activeQueryRef = useRef<{ sql: string; started: number } | null>(null);

  useEffect(() => () => client.terminate('SeeQLite was closed.'), [client]);
  useEffect(() => { document.documentElement.toggleAttribute('data-dark', darkTheme); }, [darkTheme]);

  async function openBytes(bytes: ArrayBuffer, name: string, source: AppSource, notice = '') {
    sourceRef.current = source;
    setBusy(true);
    setFileName('No database open');
    setResult(null);
    setPlanResult(null);
    setCatalog(null);
    setCatalogSearch('');
    setShowInternalObjects(false);
    setSelectedTable(null);
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
      setStatus(`${ready.tableCount} table${ready.tableCount === 1 ? '' : 's'} ready. Run the sample query or write your own SELECT.${walWarning ? ' This file is WAL-mode; uncheckpointed sidecar changes may not be included.' : ''}`);
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
    setShowInternalObjects(false);
    setSelectedTable(null);
    setStatus('Opening the bundled sample database…');
    try {
      const ready = await client.openSample('./sample.sqlite');
      setFileName(ready.fileName);
      setCatalog(ready.catalog);
      setSelectedTable(null);
      setView('query');
      setStatus(`${ready.tableCount} tables ready. Run the readiness check or write your own SELECT.`);
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
    setShowInternalObjects(false);
    setSelectedTable(null);
    setResult(null);
    setPlanResult(null);
    setView('query');
    setQuery(SAMPLE_QUERY);
    setBusy(false);
    setStatus('Choose a SQLite file. It stays in this browser tab.');
  }

  async function runQuery(selectedSql?: string) {
    const sql = selectedSql?.trim() ? selectedSql : query;
    const operation = ++operationRef.current;
    const started = performance.now();
    activeQueryRef.current = { sql, started };
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
    setQuery('SELECT 1 AS ready;');
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
    const sql = selectedSql?.trim() ? selectedSql : query;
    const operation = ++operationRef.current;
    const started = performance.now();
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
    setStatus('Query stopped. Reopen the database to continue.');
  }

  function generateJoin(relation: Catalog['foreignKeys'][number]) {
    if (!catalog) return;
    const sql = buildJoinSql(relation, catalog);
    if (!sql) {
      setStatus('This relationship cannot generate a join because its referenced table or columns are unresolved.');
      return;
    }
    if (query.trim() && !window.confirm('Replace the current SQL draft with this generated read-only join?')) return;
    setQuery(sql);
    setView('query');
    setStatus('Generated a quoted read-only join. Review it, then run the query.');
  }

  const visibleCatalog = useMemo(() => {
    if (!catalog || showInternalObjects) return catalog;
    const tables = catalog.tables.filter((table) => !table.internal);
    const tableNames = new Set(tables.map((table) => table.name));
    return { ...catalog, tables, foreignKeys: catalog.foreignKeys.filter((relation) => tableNames.has(relation.fromTable) && tableNames.has(relation.toTable)) };
  }, [catalog, showInternalObjects]);

  const filteredTables = useMemo(() => {
    const needle = catalogSearch.trim().toLowerCase();
    if (!visibleCatalog || !needle) return visibleCatalog?.tables ?? [];
    return visibleCatalog.tables.filter((table) => table.name.toLowerCase().includes(needle) || table.kind.toLowerCase().includes(needle) || table.columns.some((column) => column.name.toLowerCase().includes(needle)));
  }, [visibleCatalog, catalogSearch]);

  useEffect(() => {
    if (selectedTable?.internal && !showInternalObjects) setSelectedTable(null);
  }, [selectedTable, showInternalObjects]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <header className="topbar">
        <a className="brand" href="../../index.htm" aria-label="TinyCrafts home">
          <span className="brand-mark" aria-hidden="true">◫</span>
          <span><strong>SeeQLite</strong><small>SQLite, in your browser</small></span>
        </a>
        <div className="topbar-meta"><span>LOCAL ONLY</span><button className="theme-button" aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDarkTheme((value) => !value)}>{darkTheme ? 'Light theme' : 'Dark theme'}</button></div>
      </header>

      <main id="workspace" className="workspace" tabIndex={-1}>
        <section className="intro-column">
          <p className="eyebrow">TINYCRAFTS / 08</p>
          <h1>See what’s inside.</h1>
          <p className="lede">Open a SQLite file, understand its shape, and ask it questions without uploading a byte.</p>
          <div className="privacy-note"><span className="status-dot" /> No server. No account. No database file is saved.</div>
          {!capabilities.ok ? (
            <div className="callout error" role="alert"><strong>Browser capability missing</strong><p>This browser needs {capabilities.missing.join(', ')} to run SeeQLite locally.</p></div>
          ) : (
            <div className="open-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
              <div className="open-actions"><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Working…' : 'Open SQLite database'}</button><button className="secondary-button" onClick={openSample} disabled={busy}>Try sample database</button></div>
              <input ref={fileInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" hidden onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0])} />
              <p className="helper">SQLite 3 files up to 512 MB. Drop one file here or use the picker.</p>
            </div>
          )}
          <div className="file-status"><span className="label">DATABASE</span><strong dir="auto">{fileName}</strong><span role="status" aria-live="polite">{status}</span><div className="file-status-actions">{sourceRef.current && fileName === 'No database open' ? <button className="secondary-button compact" onClick={reopenDatabase} disabled={busy}>Reopen database</button> : null}{fileName !== 'No database open' ? <button className="secondary-button compact" onClick={resetWorkspace} disabled={busy}>Reset workspace</button> : null}</div></div>
        </section>

        <section className="query-column" aria-label="Query workspace">
          <div className="workspace-heading"><div><span className="label">WORKSPACE</span><h2>{view === 'query' ? 'Ask the file' : 'See the shape'}</h2></div><span className="mode-badge">READ ONLY</span></div>
          <div className="mode-tabs" role="tablist" aria-label="Database workspace view">
            <button className={view === 'query' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-selected={view === 'query'} onClick={() => setView('query')}>Query</button>
            <button className={view === 'diagram' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-selected={view === 'diagram'} disabled={!catalog} onClick={() => setView('diagram')}>Diagram {catalog ? `· ${catalog.foreignKeys.length} relation${catalog.foreignKeys.length === 1 ? '' : 's'}` : ''}</button>
          </div>
          {view === 'query' ? <>
            <div className="table-explorer"><div className="result-heading"><span className="label">TABLES</span><span>{catalog ? `${catalogSearch.trim() ? `${filteredTables.length} of ` : ''}${visibleCatalog?.tables.length ?? 0} objects${!showInternalObjects && catalog.tables.length !== (visibleCatalog?.tables.length ?? 0) ? ` · ${catalog.tables.length - (visibleCatalog?.tables.length ?? 0)} internal hidden` : ''}` : 'Open a database'}</span></div>{catalog ? <><label className="catalog-search"><span>FIND</span><input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search tables or columns" aria-label="Search tables and columns" autoComplete="off" /></label><div className="catalog-controls"><button className="secondary-button compact" type="button" aria-pressed={showInternalObjects} onClick={() => setShowInternalObjects((value) => !value)}>{showInternalObjects ? 'Hide internal objects' : 'Show internal objects'}</button><span>System and virtual tables stay hidden until requested.</span></div></> : null}<div className="table-list">{filteredTables.map((table) => <button key={table.name} className="table-list-item" onClick={() => { setSelectedTable(table); setQuery(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`); }} disabled={busy}><span>{table.name}</span><small>{table.internal ? 'internal · ' : ''}{table.kind} · {table.columns.length} columns</small></button>)}</div>{catalog && filteredTables.length === 0 ? <p className="catalog-empty">{(visibleCatalog?.tables.length ?? 0) === 0 ? 'No visible tables or views were found in this database.' : <>No objects match <code>{catalogSearch}</code>.</>}</p> : null}</div>
            {selectedTable ? <TableDetails table={selectedTable} catalog={catalog} /> : null}
            <Suspense fallback={<textarea aria-label="SQL query" value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} />}><SqlEditor value={query} catalog={catalog} onChange={setQuery} onRun={runQuery} onPlan={runPlan} /></Suspense>
            <div className="query-actions"><button className="primary-button compact" onClick={() => runQuery()} disabled={busy || fileName === 'No database open'}>{busy ? 'Running…' : 'Run query'}</button>{busy ? <button className="secondary-button compact" onClick={cancelQuery}>Stop running query</button> : <button className="secondary-button compact" onClick={runReadiness} disabled={fileName === 'No database open'}>Run readiness check</button>}<button className="secondary-button compact" onClick={() => runPlan()} disabled={busy || fileName === 'No database open'}>Show query plan</button><span className="shortcut">⌘ ↵</span></div>
            <div className="result-panel">
              <div className="result-heading"><span className="label">RESULT</span><span>{result ? `${result.columns.length} columns` : 'Waiting for a query'}</span></div>
              {result ? <ResultTable result={result} /> : <div className="empty-result"><span className="empty-glyph" aria-hidden="true">⌁</span><p>Open a file, then run a SELECT.</p></div>}
            </div>
            {planResult ? <div className="result-panel plan-panel"><div className="result-heading"><span className="label">QUERY PLAN</span><button className="quiet-button" onClick={() => setPlanResult(null)}>Hide query plan</button></div><PlanTree result={planResult} /></div> : null}
            {result ? <div className="export-actions"><span className="label">EXPORT RESULT</span><button className="quiet-button" onClick={() => downloadResult(result, 'csv')}>Download CSV</button><button className="quiet-button" onClick={() => downloadResult(result, 'json')}>Download JSON</button></div> : null}
            <QueryHistory items={history} onChoose={setQuery} onDelete={(at) => { const next = history.filter((item) => item.at !== at); setHistory(next); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage is optional */ } }} onClear={clearHistory} />
          </> : <ErDiagram catalog={visibleCatalog} onSelectTable={(table) => { setSelectedTable(table); setQuery(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`); setView('query'); }} onGenerateJoin={generateJoin} />}
        </section>
      </main>
      <footer className="footer"><span>SeeQLite v0.1</span><span>Built for curious local data</span></footer>
    </div>
  );
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function isSQLiteSidecarName(name: string) {
  const lowerName = name.toLowerCase();
  return SQLITE_SIDECAR_SUFFIXES.some((suffix) => lowerName.endsWith(suffix));
}

function buildJoinSql(relation: Catalog['foreignKeys'][number], catalog: Catalog) {
  const child = catalog.tables.find((table) => table.name === relation.fromTable);
  const parent = catalog.tables.find((table) => table.name === relation.toTable);
  if (!child || !parent || relation.fromColumns.length === 0 || relation.fromColumns.length !== relation.toColumns.length || relation.fromColumns.some((column) => !column)) return null;
  const parentPrimaryKey = parent.columns.filter((column) => column.primaryKey).sort((left, right) => left.primaryKey - right.primaryKey).map((column) => column.name);
  const parentColumns = relation.toColumns.map((column, index) => column || parentPrimaryKey[index] || '');
  if (parentColumns.some((column) => !column)) return null;
  const predicates = relation.fromColumns.map((column, index) => `child.${quoteIdentifier(column)} = parent.${quoteIdentifier(parentColumns[index])}`).join(' AND ');
  return `SELECT *\nFROM ${quoteIdentifier(child.name)} AS child\nJOIN ${quoteIdentifier(parent.name)} AS parent ON ${predicates};`;
}

function ErDiagram({ catalog, onSelectTable, onGenerateJoin }: { catalog: Catalog | null; onSelectTable: (table: CatalogTable) => void; onGenerateJoin: (relation: Catalog['foreignKeys'][number]) => void }) {
  if (!catalog) return <div className="diagram-empty">Open a database to see its tables and relationships.</div>;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(catalog.tables.length))));
  const cardWidth = 250;
  const cardHeight = 190;
  const gapX = 34;
  const gapY = 42;
  const width = Math.max(620, columns * (cardWidth + gapX) + gapX);
  const rows = Math.max(1, Math.ceil(catalog.tables.length / columns));
  const height = rows * (cardHeight + gapY) + gapY;
  const positions = new Map(catalog.tables.map((table, index) => [table.name, { x: gapX + (index % columns) * (cardWidth + gapX), y: gapY + Math.floor(index / columns) * (cardHeight + gapY) }]));
  return <>
    <RelationshipList catalog={catalog} onSelectTable={onSelectTable} onGenerateJoin={onGenerateJoin} />
    <div className="diagram-scroll" role="region" aria-label="Entity relationship diagram" tabIndex={0}><div className="diagram-canvas" style={{ width, height }}><svg className="diagram-lines" width={width} height={height} aria-hidden="true">{catalog.foreignKeys.map((relation) => { const from = positions.get(relation.fromTable); const to = positions.get(relation.toTable); if (!from || !to) return null; return <line key={`${relation.fromTable}-${relation.id}-${relation.toTable}`} x1={from.x + cardWidth / 2} y1={from.y + cardHeight / 2} x2={to.x + cardWidth / 2} y2={to.y + cardHeight / 2} />; })}</svg>{catalog.tables.map((table) => { const position = positions.get(table.name); if (!position) return null; return <button key={table.name} className="diagram-card" style={{ left: position.x, top: position.y }} onClick={() => onSelectTable(table)}><span className="diagram-card-title">{table.name}</span><span className="diagram-card-kind">{table.kind}</span>{table.columns.slice(0, 7).map((column) => <span className="diagram-column" key={column.name}><b>{column.primaryKey ? 'PK' : column.notNull ? '·' : ''}</b><span>{column.name}</span><small>{column.type || 'ANY'}</small></span>)}{table.columns.length > 7 && <span className="diagram-more">+ {table.columns.length - 7} more columns</span>}</button>; })}</div></div>
  </>;
}

function RelationshipList({ catalog, onSelectTable, onGenerateJoin }: { catalog: Catalog; onSelectTable: (table: CatalogTable) => void; onGenerateJoin: (relation: Catalog['foreignKeys'][number]) => void }) {
  const tableByName = new Map(catalog.tables.map((table) => [table.name, table]));
  return <section className="relationship-panel" aria-label="Declared relationships"><div className="result-heading"><span className="label">RELATIONSHIPS</span><span>{catalog.foreignKeys.length} declared</span></div>{catalog.foreignKeys.length ? <ul className="relationship-list">{catalog.foreignKeys.map((relation) => { const resolved = Boolean(tableByName.get(relation.fromTable) && tableByName.get(relation.toTable) && buildJoinSql(relation, catalog)); return <li key={`${relation.fromTable}-${relation.id}-${relation.toTable}`}><span className="relationship-kind">FOREIGN KEY · MANY → ONE</span><div className="relationship-tables"><button className="relationship-table" onClick={() => tableByName.get(relation.fromTable) && onSelectTable(tableByName.get(relation.fromTable)!)} aria-label={`Open ${relation.fromTable} table`}>{relation.fromTable}</button><span aria-hidden="true">→</span><button className="relationship-table" onClick={() => tableByName.get(relation.toTable) && onSelectTable(tableByName.get(relation.toTable)!)} aria-label={`Open ${relation.toTable} table`}>{relation.toTable}</button></div><small><code>{relation.fromColumns.join(', ')}</code> references <code>{relation.toColumns.filter(Boolean).join(', ') || 'the parent primary key'}</code></small><button className="relationship-join" onClick={() => onGenerateJoin(relation)} disabled={!resolved} aria-label={`Generate join from ${relation.fromTable} to ${relation.toTable}`} title={resolved ? 'Generate a quoted read-only join' : 'The referenced table or columns could not be resolved'}>Generate join</button></li>; })}</ul> : <p className="relationship-empty">No declared foreign keys. The diagram still shows every table and view.</p>}</section>;
}

function TableDetails({ table, catalog }: { table: CatalogTable; catalog: Catalog | null }) {
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
  return <section className="table-details" aria-label={`${table.name} details`}><div className="result-heading"><span className="label">OBJECT DETAILS</span><strong>{table.name}</strong><div className="detail-actions"><button className="quiet-button" onClick={() => copy(quoteIdentifier(table.name), 'identifier')}>Copy identifier</button><button className="quiet-button" onClick={() => copy(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`, 'select')}>Copy SELECT</button></div></div>{copyState !== 'idle' ? <p className={copyState === 'error' ? 'copy-status error' : 'copy-status'} role="status" aria-live="polite">{copyState === 'error' ? 'Clipboard access was denied. Select the text from the editor instead.' : `Copied ${copyState === 'identifier' ? 'the quoted identifier' : 'a safe SELECT statement'}.`}</p> : null}<div className="object-meta"><span>{table.internal ? 'INTERNAL' : table.kind.toUpperCase()}</span><span>{table.withoutRowid ? 'WITHOUT ROWID' : 'ROWID'}</span><span>{table.strict ? 'STRICT' : 'NORMAL AFFINITY'}</span></div><div className="detail-grid"><div><h3>Columns</h3><ul>{table.columns.map((column) => <li key={column.name}><code>{column.name}</code><span>{column.type || 'ANY'}{column.primaryKey ? ' · PK' : ''}{column.notNull ? ' · NOT NULL' : ''}{column.defaultValue !== null ? ` · DEFAULT ${column.defaultValue}` : ''}</span></li>)}</ul></div><div><h3>Indexes</h3><ul>{table.indexes.length ? table.indexes.map((index) => <li key={index.name}><code>{index.name}</code><span>{index.unique ? 'UNIQUE · ' : ''}{index.columns.join(', ') || 'expression'}</span></li>) : <li><span>No explicit indexes</span></li>}</ul><h3>Relationships</h3><ul>{relationships.length ? relationships.map((relation) => <li key={`${relation.fromTable}-${relation.id}-${relation.toTable}`}><code>{relation.fromTable === table.name ? relation.fromColumns.join(', ') : relation.toColumns.join(', ')}</code><span>→ {relation.fromTable === table.name ? relation.toTable : relation.fromTable}</span></li>) : <li><span>No declared foreign keys</span></li>}</ul></div></div>{table.schemaSql ? <details className="schema-details"><summary>Show CREATE SQL</summary><pre>{table.schemaSql}</pre></details> : null}</section>;
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
  const idIndex = result.columns.findIndex((column) => column.name.toLowerCase() === 'id');
  const parentIndex = result.columns.findIndex((column) => column.name.toLowerCase() === 'parent');
  const detailIndex = result.columns.findIndex((column) => column.name.toLowerCase() === 'detail');
  const nodes = result.rows.map((row, index) => ({
    id: planText(row[idIndex] ?? index),
    parent: planText(row[parentIndex] ?? ''),
    detail: planText(row[detailIndex] ?? row[row.length - 1] ?? 'Plan step'),
  }));
  const positions = new Map(nodes.map((node, index) => [node.id, index]));
  return <div className="plan-tree" role="list" aria-label="SQLite query plan">{nodes.length ? nodes.map((node, index) => <div className="plan-item" role="listitem" key={`${node.id}-${index}`} style={{ marginLeft: `${planDepth(node, positions, nodes)}rem` }}><span className="plan-marker" aria-hidden="true">↳</span><span className="plan-detail">{node.detail}</span></div>) : <p className="plan-empty">SQLite returned no plan steps.</p>}</div>;
}

function planDepth(node: { id: string; parent: string }, positions: Map<string, number>, nodes: Array<{ id: string; parent: string }>) {
  let depth = 0;
  let parent = node.parent;
  const seen = new Set<string>();
  while (parent && parent !== '-1' && positions.has(parent) && !seen.has(parent) && depth < 8) {
    seen.add(parent);
    depth += 1;
    parent = nodes[positions.get(parent)!].parent;
  }
  return Math.min(depth, 6);
}

function planText(value: QueryResult['rows'][number][number]) {
  if (value === null) return '';
  if (typeof value === 'object' && value.kind === 'text') return value.value;
  if (typeof value === 'object') return value.preview;
  return String(value);
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
