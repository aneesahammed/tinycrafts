import { formatNumber, isTemporalColumnType, valueToDisplay } from '../../util/format.js';

export function summarizeArtifacts(title, artifacts = []) {
  const ok = artifacts.filter((artifact) => artifact.status === 'ok');
  if (!ok.length) return artifacts[0]?.safeMessage || `${title}: no analysis was produced.`;
  if (ok.length === 1) return summarizeArtifact(ok[0]);
  return `${title}: produced ${ok.length} local analysis artifacts. ${ok.map((artifact) => artifact.title).join('; ')}.`;
}

export function summarizeArtifact(artifact) {
  if (!artifact) return 'No analysis was produced.';
  if (artifact.status && artifact.status !== 'ok') return artifact.safeMessage || `${artifact.title}: ${artifact.status}.`;
  const rows = artifact.rows || [];
  if (!rows.length) return `${artifact.title}: no rows matched.`;
  if (artifact.tool === 'profile_overview') return summarizeProfile(artifact);
  if (artifact.tool === 'missingness') return summarizeMissingness(artifact);
  if (artifact.tool === 'histogram') return `${artifact.title}: distribution returned ${rows.length} bin${rows.length === 1 ? '' : 's'}.`;
  if (artifact.tool === 'outliers') return `${artifact.title}: found ${rows.length} outlier${rows.length === 1 ? '' : 's'}.`;
  if (artifact.tool === 'correlation') return summarizeCorrelation(artifact);
  return summarizeChartLike(artifact);
}

function summarizeProfile(artifact) {
  const row = artifact.rows?.[0] || {};
  return `${artifact.title}: ${formatNullable(row.column_count)} columns, ${formatNullable(row.numeric_columns)} numeric, ${formatNullable(row.temporal_columns)} temporal, ${formatNullable(row.missing_columns)} with missing values.`;
}

function summarizeMissingness(artifact) {
  const row = artifact.rows?.[0] || {};
  if (!row.column_name) return `${artifact.title}: no missingness rows returned.`;
  return `${artifact.title}: ${row.column_name} has the highest null rate at ${formatSummaryValue(row.null_percentage)}%.`;
}

function summarizeCorrelation(artifact) {
  const row = artifact.rows?.[0] || {};
  if (!row.column_x || !row.column_y) return `${artifact.title}: no correlation pairs returned.`;
  return `${artifact.title}: strongest pair is ${row.column_x} and ${row.column_y} at ${formatSummaryValue(row.correlation)}.`;
}

function summarizeChartLike(artifact) {
  const rows = artifact.rows || [];
  const first = rows[0] || {};
  const firstSeries = artifact.chart?.series?.[0];
  const firstSeriesField = firstSeries?.field;
  const x = artifact.chart?.x;
  const columnTypes = artifact.columnTypes || {};
  if (x && firstSeriesField && first[x] != null && first[firstSeriesField] != null) {
    if (isTemporalColumnType(columnTypes[x])) return summarizeTimeSeries({ artifact, x, series: firstSeries });
    return `${artifact.title}: the top result is ${formatSummaryValue(first[x], columnTypes[x])} with ${formatSummaryValue(first[firstSeriesField], columnTypes[firstSeriesField])}.`;
  }
  return `${artifact.title}: returned ${rows.length} row${rows.length === 1 ? '' : 's'}.`;
}

function summarizeTimeSeries({ artifact, x, series }) {
  const rows = artifact.rows || [];
  const y = series.field;
  const columnTypes = artifact.columnTypes || {};
  const first = rows[0] || {};
  const last = rows[rows.length - 1] || {};
  const peak = rows.reduce((best, row) => {
    const value = toFiniteNumber(row?.[y]);
    if (value == null) return best;
    return best == null || value > best.value ? { row, value } : best;
  }, null);
  const label = series.label || y;
  const range = `${formatSummaryValue(first[x], columnTypes[x])} to ${formatSummaryValue(last[x], columnTypes[x])}`;
  const latest = formatSummaryValue(last[y], columnTypes[y]);
  if (!peak) return `${artifact.title}: ${label} runs from ${range}; latest is ${latest}.`;
  return `${artifact.title}: ${label} runs from ${range}; peak is ${formatSummaryValue(peak.row[y], columnTypes[y])} on ${formatSummaryValue(peak.row[x], columnTypes[x])}; latest is ${latest}.`;
}

function formatSummaryValue(value, columnType = null) {
  if (isTemporalColumnType(columnType)) return valueToDisplay(value, columnType);
  if (typeof value === 'number' || typeof value === 'bigint') return formatNumber(value);
  return valueToDisplay(value, columnType);
}

function toFiniteNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNullable(value) {
  return value == null ? 'unknown' : formatSummaryValue(value);
}
