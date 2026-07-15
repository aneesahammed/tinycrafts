import { useEffect, useMemo, useRef, useState } from 'react';
import { DatabaseClient } from './engine/database-client';
import type { Catalog, CatalogTable, QueryResult } from './engine/protocol';
import { checkCapabilities } from './platform/capabilities';

const SAMPLE_QUERY = 'SELECT 1 AS ready, sqlite_version() AS sqlite_version;';

export function App() {
  const client = useMemo(() => new DatabaseClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const capabilities = checkCapabilities();
  const [fileName, setFileName] = useState('No database open');
  const [query, setQuery] = useState(SAMPLE_QUERY);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [view, setView] = useState<'query' | 'diagram'>('query');
  const [status, setStatus] = useState('Choose a SQLite file. It stays in this browser tab.');
  const [busy, setBusy] = useState(false);

  useEffect(() => () => client.terminate('SeeQLite was closed.'), [client]);

  async function openBytes(bytes: ArrayBuffer, name: string) {
    setBusy(true);
    setResult(null);
    setCatalog(null);
    setStatus('Opening a private, read-only database worker…');
    try {
      if (new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\u0000') {
        throw new Error('That file does not have a readable SQLite 3 header.');
      }
      const ready = await client.openBytes(bytes, name);
      setFileName(name);
      setCatalog(ready.catalog);
      setView('query');
      setStatus(`${ready.tableCount} table${ready.tableCount === 1 ? '' : 's'} ready. Run the sample query or write your own SELECT.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open that database.');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file: File) {
    await openBytes(await file.arrayBuffer(), file.name);
  }

  async function openSample() {
    setBusy(true);
    setResult(null);
    setCatalog(null);
    setStatus('Opening the bundled sample database…');
    try {
      const ready = await client.openSample('./sample.sqlite');
      setFileName(ready.fileName);
      setCatalog(ready.catalog);
      setView('query');
      setStatus(`${ready.tableCount} tables ready. Run the readiness check or write your own SELECT.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open the sample database.');
    } finally {
      setBusy(false);
    }
  }

  async function runQuery() {
    setBusy(true);
    setStatus('Running in the SQLite worker…');
    try {
      const nextResult = await client.query(query);
      setResult(nextResult);
      setStatus(`${nextResult.returnedRows} row${nextResult.returnedRows === 1 ? '' : 's'} returned${nextResult.truncated ? ' (display capped at 1,000)' : ''}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Query failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runReadiness() {
    setQuery('SELECT 1 AS ready;');
    setBusy(true);
    setStatus('Running SELECT 1…');
    try {
      const nextResult = await client.query('SELECT 1 AS ready;');
      setResult(nextResult);
      setStatus(`${nextResult.returnedRows} row returned. SQLite is ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Readiness check failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="../../index.htm" aria-label="TinyCrafts home">
          <span className="brand-mark" aria-hidden="true">◫</span>
          <span><strong>SeeQLite</strong><small>SQLite, in your browser</small></span>
        </a>
        <div className="topbar-meta"><span>LOCAL ONLY</span><button className="theme-button" onClick={() => document.documentElement.toggleAttribute('data-dark')}>Theme</button></div>
      </header>

      <main className="workspace">
        <section className="intro-column">
          <p className="eyebrow">TINYCRAFTS / 08</p>
          <h1>See what’s inside.</h1>
          <p className="lede">Open a SQLite file, understand its shape, and ask it questions without uploading a byte.</p>
          <div className="privacy-note"><span className="status-dot" /> No server. No account. No database copy.</div>
          {!capabilities.ok ? (
            <div className="callout error" role="alert"><strong>Browser capability missing</strong><p>This browser needs {capabilities.missing.join(', ')} to run SeeQLite locally.</p></div>
          ) : (
            <div className="open-zone">
              <div className="open-actions"><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Working…' : 'Open SQLite database'}</button><button className="secondary-button" onClick={openSample} disabled={busy}>Try sample database</button></div>
              <input ref={fileInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" hidden onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0])} />
              <p className="helper">SQLite 3 files up to the current browser-safe limit.</p>
            </div>
          )}
          <div className="file-status"><span className="label">DATABASE</span><strong>{fileName}</strong><span>{status}</span></div>
        </section>

        <section className="query-column" aria-label="Query workspace">
          <div className="workspace-heading"><div><span className="label">WORKSPACE</span><h2>{view === 'query' ? 'Ask the file' : 'See the shape'}</h2></div><span className="mode-badge">READ ONLY</span></div>
          <div className="mode-tabs" role="tablist" aria-label="Database workspace view">
            <button className={view === 'query' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-selected={view === 'query'} onClick={() => setView('query')}>Query</button>
            <button className={view === 'diagram' ? 'mode-tab active' : 'mode-tab'} role="tab" aria-selected={view === 'diagram'} disabled={!catalog} onClick={() => setView('diagram')}>Diagram {catalog ? `· ${catalog.foreignKeys.length} relation${catalog.foreignKeys.length === 1 ? '' : 's'}` : ''}</button>
          </div>
          {view === 'query' ? <>
            <div className="table-explorer"><div className="result-heading"><span className="label">TABLES</span><span>{catalog ? `${catalog.tables.length} objects` : 'Open a database'}</span></div><div className="table-list">{catalog?.tables.map((table) => <button key={table.name} className="table-list-item" onClick={() => setQuery(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`)} disabled={busy}><span>{table.name}</span><small>{table.kind} · {table.columns.length} columns</small></button>)}</div></div>
            <textarea aria-label="SQL query" value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} />
            <div className="query-actions"><button className="primary-button compact" onClick={runQuery} disabled={busy || fileName === 'No database open'}>{busy ? 'Running…' : 'Run query'}</button><button className="secondary-button compact" onClick={runReadiness} disabled={busy || fileName === 'No database open'}>Run readiness check</button><span className="shortcut">⌘ ↵</span></div>
            <div className="result-panel">
              <div className="result-heading"><span className="label">RESULT</span><span>{result ? `${result.columns.length} columns` : 'Waiting for a query'}</span></div>
              {result ? <ResultTable result={result} /> : <div className="empty-result"><span className="empty-glyph" aria-hidden="true">⌁</span><p>Open a file, then run a SELECT.</p></div>}
            </div>
          </> : <ErDiagram catalog={catalog} onSelectTable={(table) => { setQuery(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`); setView('query'); }} />}
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

function ResultTable({ result }: { result: QueryResult }) {
  return <div className="table-wrap"><table><thead><tr>{result.columns.map((column, index) => <th key={`${column.name}-${index}`}>{column.name || `column_${index + 1}`}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={index}>{formatValue(value)}</td>)}</tr>)}</tbody></table></div>;
}

function formatValue(value: QueryResult['rows'][number][number]) {
  if (value === null) return <span className="null-value">NULL</span>;
  if (typeof value === 'object') return <span className="blob-value">BLOB · {value.bytes} bytes</span>;
  return String(value);
}
