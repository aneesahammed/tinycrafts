import React, { useMemo, useState } from 'react';
import { ChartCard, chartIsRenderable } from './ChartCard.jsx';
import { sanitizeAggregatePayload, summarizeAggregateWithGroq } from '../ai/aggregate-upload.js';
import { valueToDisplay } from '../util/format.js';

const TAB_DEFS = [
  { id: 'chart', label: 'Chart' },
  { id: 'table', label: 'Table' },
  { id: 'sql', label: 'SQL' },
];

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT',
  'NULL', 'ASC', 'DESC', 'HAVING', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
  'IN', 'LIKE', 'ILIKE', 'IS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'CREATE', 'REPLACE',
  'VIEW', 'TABLE', 'WITH', 'UNION', 'INTERSECT', 'ALL', 'BETWEEN', 'INTERVAL', 'TRUE', 'FALSE',
]);
const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'TRY_CAST', 'DATE', 'STRFTIME',
  'EPOCH', 'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'LENGTH', 'LOWER', 'UPPER', 'SUBSTR', 'SUBSTRING',
  'TRIM', 'CONCAT', 'ROUND', 'FLOOR', 'CEIL', 'ABS', 'GREATEST', 'LEAST',
]);

const SQL_TOKEN_RE = /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(--[^\n]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\s])/g;

function tokenizeSql(sql) {
  const tokens = [];
  for (const match of String(sql).matchAll(SQL_TOKEN_RE)) {
    if (match[1]) tokens.push({ type: 'ident-quoted', value: match[1] });
    else if (match[2]) tokens.push({ type: 'string', value: match[2] });
    else if (match[3]) tokens.push({ type: 'comment', value: match[3] });
    else if (match[4]) tokens.push({ type: 'number', value: match[4] });
    else if (match[5]) {
      const upper = match[5].toUpperCase();
      if (SQL_KEYWORDS.has(upper)) tokens.push({ type: 'keyword', value: match[5] });
      else if (SQL_FUNCTIONS.has(upper)) tokens.push({ type: 'function', value: match[5] });
      else tokens.push({ type: 'ident', value: match[5] });
    }
    else if (match[6]) tokens.push({ type: 'space', value: match[6] });
    else if (match[7]) tokens.push({ type: 'punct', value: match[7] });
  }
  return tokens;
}

export function SqlHighlight({ sql }) {
  const tokens = useMemo(() => (sql ? tokenizeSql(sql) : []), [sql]);
  if (!sql) return null;
  return (
    <pre className="analysis-sql-pre">
      {tokens.map((token, index) => (
        token.type === 'space'
          ? token.value
          : <span key={index} className={`sql-${token.type}`}>{token.value}</span>
      ))}
    </pre>
  );
}

export function AnalysisMessage({ analysis, settings, onOpenSql, onCopySql }) {
  const renderable = useMemo(() => chartIsRenderable(analysis), [analysis]);
  const rowCount = analysis?.rows?.length ?? 0;
  const hasKpi = rowCount === 1 && Boolean(analysis?.chart?.series?.length) && analysis?.chart?.kind !== 'table';
  const hasChartTab = renderable || hasKpi;
  const hasTableTab = rowCount > 0;
  const hasSqlTab = Boolean(analysis?.sql);
  const visibleTabs = TAB_DEFS.filter((t) =>
    (t.id === 'chart' && hasChartTab) ||
    (t.id === 'table' && hasTableTab) ||
    (t.id === 'sql' && hasSqlTab),
  );
  const defaultTab = hasChartTab ? 'chart' : (hasTableTab ? 'table' : 'sql');
  const [tab, setTab] = useState(defaultTab);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!analysis) return null;

  const preview = sanitizeAggregatePayload({ columns: analysis.columns, rows: analysis.rows });

  async function sendAggregate() {
    setBusy(true);
    setError('');
    try {
      const response = await summarizeAggregateWithGroq({
        apiKey: settings.apiKey,
        model: settings.model,
        question: analysis.question,
        analysis,
      });
      setSummary(response);
    } catch (err) {
      setError(err?.message || 'Could not summarize aggregate rows.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="analysis-card">
      <header className="analysis-card-head">
        <h3>{analysis.title}</h3>
        <div className="analysis-card-meta">
          <span className="pill">Schema-only context</span>
          <span className="dot" aria-hidden="true">·</span>
          <span className="mono">{analysis.elapsedMs ?? 0} ms</span>
          <span className="dot" aria-hidden="true">·</span>
          <span>{rowCount} {rowCount === 1 ? 'row' : 'rows'}</span>
        </div>
      </header>

      {visibleTabs.length > 1 ? (
        <div className="analysis-tabs" role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="analysis-tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="analysis-tabpanel">
        {tab === 'chart' && hasChartTab ? <ChartCard analysis={analysis} /> : null}
        {tab === 'table' && hasTableTab ? <TablePreview columns={analysis.columns} rows={analysis.rows} /> : null}
        {tab === 'sql' && hasSqlTab ? (
          <div className="analysis-sql">
            <SqlHighlight sql={analysis.sql} />
            <div className="analysis-sql-actions">
              <button type="button" onClick={() => onCopySql?.(analysis.sql)}>Copy SQL</button>
              <button type="button" onClick={() => onOpenSql?.(analysis.sql)}>Open in editor</button>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="analysis-card-foot">
        <button type="button" className="analysis-aggregate-trigger" onClick={() => setPreviewOpen((open) => !open)}>
          {previewOpen ? '↓ Hide aggregate preview' : 'Send aggregate rows for AI summary →'}
        </button>
        {previewOpen ? (
          <div className="analysis-preview">
            <p>Preview: {preview.rows.length} rows, {preview.columns.length} columns{preview.truncated ? ' (truncated to 50 rows)' : ''}.</p>
            <TablePreview columns={preview.columns} rows={preview.rows} maxRows={preview.rows.length} />
            <button type="button" disabled={busy || !settings.apiKey} onClick={sendAggregate}>
              {busy ? 'Sending…' : 'Confirm and send'}
            </button>
          </div>
        ) : null}
        {summary ? <p className="analysis-summary">Sent at {summary.sentAt} — {summary.text}</p> : null}
        {error ? <p className="analysis-error">{error}</p> : null}
      </footer>
    </article>
  );
}

export function TablePreview({ columns = [], rows = [], maxRows = 100 }) {
  if (!columns.length) return null;
  const visibleRows = rows.slice(0, maxRows);
  return (
    <div className="assistant-table-wrap">
      <table className="assistant-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => <td key={column}>{valueToDisplay(row?.[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > visibleRows.length ? (
        <p className="assistant-table-more">Showing {visibleRows.length} of {rows.length} rows.</p>
      ) : null}
    </div>
  );
}
