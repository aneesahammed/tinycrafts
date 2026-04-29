import { valueToDisplay } from '../../util/format.js';

export const PERSISTED_ARTIFACT_LIMITS = {
  maxRows: 20,
  maxColumns: 8,
  maxCellChars: 160,
};

export function runtimeArtifactFromJob({ job, result, elapsedMs = 0, warnings = [] }) {
  const rows = result?.rows || job.rows || [];
  const columns = result?.columns || job.columns || inferColumns(rows);
  const columnTypes = result?.columnTypes || job.columnTypes || {};
  return {
    id: job.id,
    tool: job.tool,
    status: 'ok',
    title: job.title,
    text: '',
    sql: job.sql || null,
    params: job.params || [],
    columns,
    columnTypes,
    rows,
    chart: job.chart || { kind: 'table', x: null, series: [] },
    warnings,
    elapsedMs,
    rowCount: rows.length,
    truncated: Boolean(result?.truncated),
  };
}

export function diagnosticArtifact({
  id = 'diagnostic',
  tool = 'diagnostic',
  status = 'error',
  code = 'ANALYSIS_ERROR',
  safeMessage = 'Analysis failed.',
  failedStepId = null,
  warnings = [],
} = {}) {
  return {
    id,
    tool,
    status,
    code,
    safeMessage,
    failedStepId,
    warnings,
    rows: [],
    columns: [],
    columnTypes: {},
    sql: null,
    params: [],
    chart: { kind: 'table', x: null, series: [] },
    persisted: true,
  };
}

export function persistableAnalysis(analysis, limits = PERSISTED_ARTIFACT_LIMITS) {
  if (!analysis) return null;
  const artifacts = (analysis.artifacts || []).map((artifact) => persistableArtifact(artifact, limits));
  return {
    schemaVersion: 2,
    type: analysis.type || 'analysis_result',
    mode: analysis.mode,
    title: analysis.title,
    question: analysis.question,
    text: analysis.text,
    artifacts,
    primaryArtifactId: analysis.primaryArtifactId || artifacts[0]?.id || null,
    privacyNotice: analysis.privacyNotice,
    datasetFingerprint: analysis.datasetFingerprint || null,
  };
}

export function persistableArtifact(artifact, limits = PERSISTED_ARTIFACT_LIMITS) {
  if (!artifact) return null;
  const columns = (artifact.columns || []).map(String).slice(0, limits.maxColumns);
  const rows = (artifact.rows || []).slice(0, limits.maxRows).map((row) => {
    const next = {};
    for (const column of columns) {
      next[column] = trimCell(valueToDisplay(row?.[column], artifact.columnTypes?.[column]), limits.maxCellChars);
    }
    return next;
  });
  return {
    schemaVersion: 2,
    id: artifact.id,
    tool: artifact.tool,
    status: artifact.status || 'ok',
    title: artifact.title,
    text: artifact.text || '',
    columns,
    columnTypes: Object.fromEntries(columns.map((column) => [column, artifact.columnTypes?.[column] || null])),
    rows,
    chart: artifact.chart || { kind: 'table', x: null, series: [] },
    warnings: artifact.warnings || [],
    rowCount: artifact.rowCount ?? artifact.rows?.length ?? 0,
    truncated: Boolean(artifact.truncated || artifact.rows?.length > rows.length || (artifact.columns || []).length > columns.length),
    elapsedMs: artifact.elapsedMs ?? 0,
  };
}

export function normalizeAnalysisForRender(analysis) {
  if (!analysis) return null;
  if (Array.isArray(analysis.artifacts)) return analysis;
  const artifact = {
    id: 'legacy_result',
    tool: 'aggregate_query',
    status: 'ok',
    title: analysis.title,
    text: analysis.text || '',
    sql: analysis.sql || null,
    params: analysis.params || [],
    columns: analysis.columns || [],
    columnTypes: analysis.columnTypes || {},
    rows: analysis.rows || [],
    chart: analysis.chart || { kind: 'table', x: null, series: [] },
    warnings: [],
    elapsedMs: analysis.elapsedMs ?? 0,
    rowCount: analysis.rows?.length ?? 0,
    truncated: false,
  };
  return {
    ...analysis,
    schemaVersion: 2,
    artifacts: [artifact],
    primaryArtifactId: artifact.id,
  };
}

function inferColumns(rows) {
  return rows[0] ? Object.keys(rows[0]) : [];
}

function trimCell(value, maxChars) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}
