import { valueToDisplay } from '../util/format.js';
import { callGroqText } from './groq-client.js';
import { AGGREGATE_UPLOAD_LIMITS, GROQ_LIMITS } from './privacy.js';

export function sanitizeAggregatePayload({ columns = [], columnTypes = {}, rows = [] }, limits = AGGREGATE_UPLOAD_LIMITS) {
  const safeColumns = columns.map(String).slice(0, limits.maxColumns);
  const safeRows = [];
  let totalChars = 0;
  let truncated = columns.length > safeColumns.length || rows.length > limits.maxRows;

  for (const row of rows.slice(0, limits.maxRows)) {
    const safeRow = {};
    for (const column of safeColumns) {
      let value = valueToDisplay(row?.[column], columnTypes[column]);
      if (value.length > limits.maxCellChars) {
        value = `${value.slice(0, limits.maxCellChars)}...`;
        truncated = true;
      }
      totalChars += value.length + column.length;
      if (totalChars > limits.maxPayloadChars) {
        truncated = true;
        return { columns: safeColumns, rows: safeRows, truncated, totalChars };
      }
      safeRow[column] = value;
    }
    safeRows.push(safeRow);
  }

  return { columns: safeColumns, rows: safeRows, truncated, totalChars };
}

export async function summarizeAggregateWithGroq({ apiKey, model, question, analysis, fetchImpl, abortSignal }) {
  const request = buildAggregateSummaryRequest({
    question,
    title: analysis.title,
    columns: analysis.columns,
    columnTypes: analysis.columnTypes,
    rows: analysis.rows,
  });
  const payload = request.aggregatePayload;
  const text = await callGroqText({
    apiKey,
    model,
    fetchImpl,
    abortSignal,
    maxCompletionTokens: GROQ_LIMITS.maxCompletionTokens,
    messages: [
      {
        role: 'system',
        content: 'You summarize aggregate query results. Do not claim access to source rows. Mention if the payload was truncated.',
      },
      {
        role: 'user',
        content: JSON.stringify(request),
      },
    ],
  });
  return {
    text,
    payload,
    sentAt: new Date().toISOString(),
  };
}

export function buildAggregateSummaryRequest(
  { question = '', title = '', columns = [], columnTypes = {}, rows = [] },
  limits = AGGREGATE_UPLOAD_LIMITS,
) {
  const payload = sanitizeAggregatePayload({ columns, columnTypes, rows }, limits);
  const request = {
    question: trimText(question, limits.maxCellChars),
    title: trimText(title, 120),
    aggregatePayload: payload,
  };
  trimSerializedRequest(request, limits.maxPayloadChars);
  return request;
}

function trimSerializedRequest(request, maxChars) {
  while (JSON.stringify(request).length > maxChars) {
    request.aggregatePayload.truncated = true;
    if (request.aggregatePayload.rows.length) {
      request.aggregatePayload.rows.pop();
      continue;
    }
    if (request.aggregatePayload.columns.length) {
      const removed = request.aggregatePayload.columns.pop();
      for (const row of request.aggregatePayload.rows) delete row[removed];
      continue;
    }
    if (request.question.length) {
      request.question = trimText(request.question, Math.max(0, Math.floor(request.question.length / 2)));
      continue;
    }
    if (request.title.length) {
      request.title = trimText(request.title, Math.max(0, Math.floor(request.title.length / 2)));
      continue;
    }
    break;
  }
}

function trimText(value, maxChars) {
  const text = String(value || '');
  if (maxChars <= 0) return '';
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}
