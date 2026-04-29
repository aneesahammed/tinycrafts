import { ANALYSIS_CATALOG_VERSION } from './tool-schema.js';

export const SENSITIVE_COLUMN_RE = /\b(ssn|social|passport|dob|birth|salary|payroll|secret|token|key|password|patient|diagnosis|employee_id|account_id)\b/i;

export function buildPlanMemory({ thread = null, currentFingerprint = null, promptColumns = [] } = {}) {
  if (!thread?.datasetFingerprint || thread.datasetFingerprint !== currentFingerprint) return null;
  const promptColumnNames = new Set(promptColumns.map((column) => column.name || column));
  const memories = [];
  for (const message of thread.messages || []) {
    const analysis = message.analysis;
    if (!analysis?.artifacts?.length) continue;
    for (const artifact of analysis.artifacts) {
      const columns = (artifact.columns || [])
        .filter((column) => promptColumnNames.has(column))
        .filter((column) => !isSensitiveColumnName(column));
      memories.push({
        tool: artifact.tool,
        title: artifact.title,
        columns,
        chartKind: artifact.chart?.kind || 'table',
      });
    }
  }
  return memories.length ? { catalogVersion: ANALYSIS_CATALOG_VERSION, artifacts: memories.slice(-6) } : null;
}

export function isSensitiveColumnName(name) {
  return SENSITIVE_COLUMN_RE.test(tokenizeColumnName(name).join(' '));
}

export function tokenizeColumnName(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function selectPromptColumns({ question = '', columns = [], maxColumns = 120, maxSelected = 40 } = {}) {
  const safeColumns = columns || [];
  if (safeColumns.length <= maxColumns) return { columns: safeColumns, omitted: 0, narrowed: false };
  const questionTokens = new Set(tokenizeColumnName(question));
  const scored = safeColumns.map((column) => ({
    column,
    score: scoreColumn(column.name, questionTokens),
  })).filter((item) => item.score > 0);
  scored.sort((a, b) => b.score - a.score || String(a.column.name).localeCompare(String(b.column.name)));
  const selected = scored.slice(0, maxSelected).map((item) => item.column);
  return {
    columns: selected,
    omitted: safeColumns.length - selected.length,
    narrowed: true,
    needsClarification: selected.length === 0,
  };
}

function scoreColumn(name, questionTokens) {
  const columnTokens = tokenizeColumnName(name);
  if (!columnTokens.length || !questionTokens.size) return 0;
  let score = 0;
  for (const token of columnTokens) {
    if (questionTokens.has(token)) score += 2;
    for (const q of questionTokens) {
      if (token.length >= 3 && q.length >= 3 && (token.includes(q) || q.includes(token))) score += 1;
    }
  }
  return score;
}
