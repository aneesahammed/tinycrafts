import { valueToDisplay } from '../util/format.js';
import { callGroqText } from './groq-client.js';
import { AGGREGATE_UPLOAD_LIMITS, GROQ_LIMITS } from './privacy.js';

export function sanitizeAggregatePayload({ columns = [], rows = [] }, limits = AGGREGATE_UPLOAD_LIMITS) {
  const safeColumns = columns.map(String).slice(0, limits.maxColumns);
  const safeRows = [];
  let totalChars = 0;
  let truncated = columns.length > safeColumns.length || rows.length > limits.maxRows;

  for (const row of rows.slice(0, limits.maxRows)) {
    const safeRow = {};
    for (const column of safeColumns) {
      let value = valueToDisplay(row?.[column]);
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
  const payload = sanitizeAggregatePayload({ columns: analysis.columns, rows: analysis.rows });
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
        content: JSON.stringify({
          question,
          title: analysis.title,
          aggregatePayload: payload,
        }),
      },
    ],
  });
  return {
    text,
    payload,
    sentAt: new Date().toISOString(),
  };
}
