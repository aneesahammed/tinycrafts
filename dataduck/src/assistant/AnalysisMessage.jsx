import React, { useState } from 'react';
import { ChartCard } from './ChartCard.jsx';
import { sanitizeAggregatePayload, summarizeAggregateWithGroq } from '../ai/aggregate-upload.js';
import { valueToDisplay } from '../util/format.js';

export function AnalysisMessage({ analysis, settings, onOpenSql, onCopySql }) {
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
    <article className="assistant-analysis">
      <header className="assistant-analysis-head">
        <div>
          <h3>{analysis.title}</h3>
          <p>{analysis.privacyNotice}</p>
        </div>
        <span>{analysis.elapsedMs ?? 0} ms</span>
      </header>
      <ChartCard analysis={analysis} />
      <TablePreview columns={analysis.columns} rows={analysis.rows} />
      <details className="assistant-sql">
        <summary>SQL</summary>
        <pre>{analysis.sql}</pre>
        <div className="assistant-actions">
          <button type="button" onClick={() => onCopySql?.(analysis.sql)}>Copy SQL</button>
          <button type="button" onClick={() => onOpenSql?.(analysis.sql)}>Open in editor</button>
        </div>
      </details>
      <div className="assistant-aggregate">
        <button type="button" onClick={() => setPreviewOpen((open) => !open)}>
          Send aggregate rows for AI summary
        </button>
        {previewOpen ? (
          <div className="assistant-preview">
            <p>Preview: {preview.rows.length} rows, {preview.columns.length} columns{preview.truncated ? ' (truncated)' : ''}.</p>
            <TablePreview columns={preview.columns} rows={preview.rows} maxRows={preview.rows.length} />
            <button type="button" disabled={busy || !settings.apiKey} onClick={sendAggregate}>
              {busy ? 'Sending aggregate rows' : 'Confirm and send aggregate rows'}
            </button>
          </div>
        ) : null}
        {summary ? <p className="assistant-note">Aggregate summary sent to Groq at {summary.sentAt}. {summary.text}</p> : null}
        {error ? <p className="assistant-error">{error}</p> : null}
      </div>
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
      {rows.length > visibleRows.length ? <p className="assistant-muted">Showing {visibleRows.length} of {rows.length} rows.</p> : null}
    </div>
  );
}
