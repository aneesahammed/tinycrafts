import { useEffect, useMemo, useRef, useState } from 'react';
import { DatabaseClient } from './engine/database-client';
import type { Catalog, CatalogTable, QueryResult } from './engine/protocol';
import { checkCapabilities } from './platform/capabilities';

const SAMPLE_QUERY = 'SELECT 1 AS ready, sqlite_version() AS sqlite_version;';
type AppSource = { kind: 'file'; file: File } | { kind: 'sample' };
type HistoryItem = { sql: string; status: 'success' | 'error'; at: number; durationMs: number };
const HISTORY_KEY = 'seeqlite.query-history.v1';

function loadHistory(): HistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is HistoryItem => typeof item?.sql === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
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
  const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);
  const [view, setView] = useState<'query' | 'diagram'>('query');
  const [status, setStatus] = useState('Choose a SQLite file. It stays in this browser tab.');
  const [busy, setBusy] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [planResult, setPlanResult] = useState<QueryResult | null>(null);
  const operationRef = useRef(0);

  useEffect(() => () => client.terminate('SeeQLite was closed.'), [client]);
  useEffect(() => { document.documentElement.toggleAttribute('data-dark', darkTheme); }, [darkTheme]);

  async function openBytes(bytes: ArrayBuffer, name: string, source: AppSource) {
    sourceRef.current = source;
    setBusy(true);
    setFileName('No database open');
    setResult(null);
    setPlanResult(null);
    setCatalog(null);
    setSelectedTable(null);
    setStatus('Opening a private, read-only database worker…');
    try {
      if (new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\u0000') {
        throw new Error('That file does not have a readable SQLite 3 header.');
      }
      const ready = await client.openBytes(bytes, name);
      setFileName(name);
      setCatalog(ready.catalog);
      setSelectedTable(null);
      setView('query');
      setStatus(`${ready.tableCount} table${ready.tableCount === 1 ? '' : 's'} ready. Run the sample query or write your own SELECT.`);
    } catch (error) {
      client.terminate('The database did not open.');
      setStatus(error instanceof Error ? error.message : 'Could not open that database.');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file: File) {
    await openBytes(await file.arrayBuffer(), file.name, { kind: 'file', file });
  }

  async function openSample() {
    sourceRef.current = { kind: 'sample' };
    setBusy(true);
    setFileName('No database open');
    setResult(null);
    setPlanResult(null);
    setCatalog(null);
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
    setSelectedTable(null);
    setResult(null);
    setPlanResult(null);
    setView('query');
    setQuery(SAMPLE_QUERY);
    setBusy(false);
    setStatus('Choose a SQLite file. It stays in this browser tab.');
  }

  async function runQuery() {
    const operation = ++operationRef.current;
    const started = performance.now();
    setBusy(true);
    setStatus('Running in the SQLite worker…');
    try {
      const nextResult = await client.query(query);
      if (operation !== operationRef.current) return;
      setResult(nextResult);
      addHistory({ sql: query, status: 'success', at: Date.now(), durationMs: performance.now() - started });
      setStatus(`${nextResult.returnedRows} row${nextResult.returnedRows === 1 ? '' : 's'} returned${nextResult.truncated ? ' (display capped at 1,000)' : ''}.`);
    } catch (error) {
      if (operation !== operationRef.current) return;
      addHistory({ sql: query, status: 'error', at: Date.now(), durationMs: performance.now() - started });
      setStatus(error instanceof Error ? error.message : 'Query failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runReadiness() {
    const operation = ++operationRef.current;
    const started = performance.now();
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
      setBusy(false);
    }
  }

  async function runPlan() {
    const operation = ++operationRef.current;
    const started = performance.now();
    setBusy(true);
    setStatus('Explaining the query in the SQLite worker…');
    try {
      const nextPlan = await client.query(`EXPLAIN QUERY PLAN ${query}`);
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

  function addHistory(item: HistoryItem) {
    setHistory((current) => {
      const next = [item, ...current].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage is optional */ }
      return next;
    });
  }

  function clearHistory() {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage is optional */ }
  }

  function cancelQuery() {
    operationRef.current += 1;
    client.terminate('Query stopped.');
    setBusy(false);
    setFileName('No database open');
    setCatalog(null);
    setResult(null);
    setPlanResult(null);
    setStatus('Query stopped. Reopen the database to continue.');
  }

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
            <div className="open-zone">
              <div className="open-actions"><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Working…' : 'Open SQLite database'}</button><button className="secondary-button" onClick={openSample} disabled={busy}>Try sample database</button></div>
              <input ref={fileInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" hidden onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0])} />
              <p className="helper">SQLite 3 files up to the current browser-safe limit.</p>
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
            <div className="table-explorer"><div className="result-heading"><span className="label">TABLES</span><span>{catalog ? `${catalog.tables.length} objects` : 'Open a database'}</span></div><div className="table-list">{catalog?.tables.map((table) => <button key={table.name} className="table-list-item" onClick={() => { setSelectedTable(table); setQuery(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`); }} disabled={busy}><span>{table.name}</span><small>{table.kind} · {table.columns.length} columns</small></button>)}</div></div>
            {selectedTable ? <TableDetails table={selectedTable} catalog={catalog} /> : null}
            <textarea aria-label="SQL query" value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} />
            <div className="query-actions"><button className="primary-button compact" onClick={runQuery} disabled={busy || fileName === 'No database open'}>{busy ? 'Running…' : 'Run query'}</button>{busy ? <button className="secondary-button compact" onClick={cancelQuery}>Stop running query</button> : <button className="secondary-button compact" onClick={runReadiness} disabled={fileName === 'No database open'}>Run readiness check</button>}<button className="secondary-button compact" onClick={runPlan} disabled={busy || fileName === 'No database open'}>Show query plan</button><span className="shortcut">⌘ ↵</span></div>
            <div className="result-panel">
              <div className="result-heading"><span className="label">RESULT</span><span>{result ? `${result.columns.length} columns` : 'Waiting for a query'}</span></div>
              {result ? <ResultTable result={result} /> : <div className="empty-result"><span className="empty-glyph" aria-hidden="true">⌁</span><p>Open a file, then run a SELECT.</p></div>}
            </div>
            {planResult ? <div className="result-panel plan-panel"><div className="result-heading"><span className="label">QUERY PLAN</span><button className="quiet-button" onClick={() => setPlanResult(null)}>Hide query plan</button></div><ResultTable result={planResult} /></div> : null}
            {result ? <div className="export-actions"><span className="label">EXPORT RESULT</span><button className="quiet-button" onClick={() => downloadResult(result, 'csv')}>Download CSV</button><button className="quiet-button" onClick={() => downloadResult(result, 'json')}>Download JSON</button></div> : null}
            <QueryHistory items={history} onChoose={setQuery} onClear={clearHistory} />
          </> : <ErDiagram catalog={catalog} onSelectTable={(table) => { setSelectedTable(table); setQuery(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`); setView('query'); }} />}
        </section>
      </main>
      <footer className="footer"><span>SeeQLite v0.1</span><span>Built for curious local data</span></footer>
    </div>
  );
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function ErDiagram({ catalog, onSelectTable }: { catalog: Catalog | null; onSelectTable: (table: CatalogTable) => void }) {
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
  return <div className="diagram-scroll" role="region" aria-label="Entity relationship diagram" tabIndex={0}><div className="diagram-canvas" style={{ width, height }}><svg className="diagram-lines" width={width} height={height} aria-hidden="true">{catalog.foreignKeys.map((relation) => { const from = positions.get(relation.fromTable); const to = positions.get(relation.toTable); if (!from || !to) return null; return <line key={`${relation.fromTable}-${relation.id}-${relation.toTable}`} x1={from.x + cardWidth / 2} y1={from.y + cardHeight / 2} x2={to.x + cardWidth / 2} y2={to.y + cardHeight / 2} />; })}</svg>{catalog.tables.map((table) => { const position = positions.get(table.name); if (!position) return null; return <button key={table.name} className="diagram-card" style={{ left: position.x, top: position.y }} onClick={() => onSelectTable(table)}><span className="diagram-card-title">{table.name}</span><span className="diagram-card-kind">{table.kind}</span>{table.columns.slice(0, 7).map((column) => <span className="diagram-column" key={column.name}><b>{column.primaryKey ? 'PK' : column.notNull ? '·' : ''}</b><span>{column.name}</span><small>{column.type || 'ANY'}</small></span>)}{table.columns.length > 7 && <span className="diagram-more">+ {table.columns.length - 7} more columns</span>}</button>; })}</div></div>;
}

function TableDetails({ table, catalog }: { table: CatalogTable; catalog: Catalog | null }) {
  const relationships = catalog?.foreignKeys.filter((relation) => relation.fromTable === table.name || relation.toTable === table.name) ?? [];
  return <section className="table-details" aria-label={`${table.name} details`}><div className="result-heading"><span className="label">OBJECT DETAILS</span><strong>{table.name}</strong></div><div className="detail-grid"><div><h3>Columns</h3><ul>{table.columns.map((column) => <li key={column.name}><code>{column.name}</code><span>{column.type || 'ANY'}{column.primaryKey ? ' · PK' : ''}{column.notNull ? ' · NOT NULL' : ''}</span></li>)}</ul></div><div><h3>Indexes</h3><ul>{table.indexes.length ? table.indexes.map((index) => <li key={index.name}><code>{index.name}</code><span>{index.unique ? 'UNIQUE · ' : ''}{index.columns.join(', ') || 'expression'}</span></li>) : <li><span>No explicit indexes</span></li>}</ul><h3>Relationships</h3><ul>{relationships.length ? relationships.map((relation) => <li key={`${relation.fromTable}-${relation.id}-${relation.toTable}`}><code>{relation.fromTable === table.name ? relation.fromColumns.join(', ') : relation.toColumns.join(', ')}</code><span>→ {relation.fromTable === table.name ? relation.toTable : relation.fromTable}</span></li>) : <li><span>No declared foreign keys</span></li>}</ul></div></div></section>;
}

function ResultTable({ result }: { result: QueryResult }) {
  return <div className="table-wrap"><table><caption className="sr-only">Query result</caption><thead><tr>{result.columns.map((column, index) => <th scope="col" key={`${column.name}-${index}`}>{column.name || `column_${index + 1}`}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={index}>{formatValue(value)}</td>)}</tr>)}</tbody></table></div>;
}

function QueryHistory({ items, onChoose, onClear }: { items: HistoryItem[]; onChoose: (sql: string) => void; onClear: () => void }) {
  return <details className="history-panel"><summary>Query history <span>{items.length}</span></summary>{items.length === 0 ? <p className="history-empty">Successful and failed SQL stays here only as UI history.</p> : <><div className="history-actions"><button className="quiet-button" onClick={onClear}>Clear query history</button></div><div className="history-list">{items.map((item, index) => <button key={`${item.at}-${index}`} className="history-item" onClick={() => onChoose(item.sql)}><span className={item.status === 'success' ? 'history-status success' : 'history-status error'}>{item.status}</span><code>{item.sql}</code><small>{Math.round(item.durationMs)} ms</small></button>)}</div></>}</details>;
}

function downloadResult(result: QueryResult, format: 'csv' | 'json') {
  const headers = result.columns.map((column, index) => column.name || `column_${index + 1}`);
  const body = format === 'csv'
    ? [headers, ...result.rows.map((row) => row.map(csvValue))].map((row) => row.map(csvEscape).join(',')).join('\n')
    : JSON.stringify(result.rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, jsonValue(row[index])]))), null, 2);
  const blob = new Blob([body], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `seeqlite-result.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvValue(value: QueryResult['rows'][number][number]) {
  if (value === null) return '';
  if (typeof value === 'object') return `BLOB (${value.bytes} bytes)${value.preview ? ` ${value.preview}` : ''}`;
  return String(value);
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
  if (typeof value === 'object') return <span className="blob-value">BLOB · {value.bytes} bytes</span>;
  return String(value);
}
