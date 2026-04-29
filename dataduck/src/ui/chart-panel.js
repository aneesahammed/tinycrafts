// Minimal "Chart this" panel — auto-detects the most useful x/y from a query
// result and renders a small SVG bar or line chart. Lives in the right drawer
// using the same plumbing as the column profiler. Uses no React; the goal is
// to give power users a one-click chart without going through the AI assistant.
import { setHtml, esc } from '../util/dom.js';
import { isNumericSqlType, isTemporalSqlType } from '../duckdb/sql-types.js';
import { abbreviateCount, formatNumber, valueToDisplay } from '../util/format.js';
import { closeRightPanel, ensureRightPanel, openRightPanel } from './right-panel.js';

const SVG_WIDTH = 320;
const SVG_HEIGHT = 180;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28;
const MAX_BARS = 30;
const AGGREGATES = [
  ['sum', 'Sum'],
  ['avg', 'Average'],
  ['count', 'Count'],
  ['min', 'Min'],
  ['max', 'Max'],
];

export function mountChartPanel(el, store) {
  const drawer = ensureRightPanel(el, store);

  let pick = null; // { kind, x, y, aggregate }
  let renderedRows = null;
  let renderedColumnsKey = '';

  const close = () => {
    pick = null;
    renderedRows = null;
    renderedColumnsKey = '';
    closeRightPanel(el, store);
  };

  const open = () => {
    openRightPanel(el, store, { type: 'chart', payload: null });
    renderForResult(store.state, { force: true });
  };

  function renderForResult(state, { force = false } = {}) {
    if (!force && !resultChanged(state)) return;
    rememberResult(state);
    if (!state.resultColumns?.length) {
      pick = null;
      renderEmpty(drawer, close, 'Run a query before opening a chart.');
      return;
    }
    if (!state.resultRows?.length) {
      pick = null;
      renderEmpty(drawer, close, 'This result has columns but no rows to plot.');
      return;
    }
    pick = autoDetect(state.resultColumns, state.resultColumnTypes);
    if (!pick) {
      renderEmpty(drawer, close);
      return;
    }
    render();
  }

  function resultChanged(state) {
    return renderedRows !== state.resultRows || renderedColumnsKey !== resultColumnsKey(state);
  }

  function rememberResult(state) {
    renderedRows = state.resultRows;
    renderedColumnsKey = resultColumnsKey(state);
  }

  function render() {
    if (!pick) return;
    const s = store.state;
    const xOptions = s.resultColumns.filter((c) => isCategoricalLike(c, s.resultRows, s.resultColumnTypes) || isTemporalSqlType(s.resultColumnTypes?.[c]));
    const yOptions = s.resultColumns.filter((c) => isNumericSqlType(s.resultColumnTypes?.[c]));
    const fallbackX = xOptions.length ? xOptions : s.resultColumns;
    const fallbackY = yOptions.length ? yOptions : s.resultColumns;

    setHtml(drawer, `
      <div class="chart-panel-head">
        <div class="chart-panel-heading">
          <p class="chart-panel-kicker">Chart</p>
          <h2>${esc(chartTitle(pick))}</h2>
        </div>
        <button class="chart-panel-close" type="button" data-action="close" aria-label="Close chart">×</button>
      </div>
      <div class="chart-panel-controls">
        <label><span>X</span>
          <select data-axis="x">${fallbackX.map((c) => `<option value="${esc(c)}"${c === pick.x ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </label>
        <label><span>Y</span>
          <select data-axis="y">${fallbackY.map((c) => `<option value="${esc(c)}"${c === pick.y ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </label>
        <label><span>Type</span>
          <select data-axis="kind">
            <option value="bar"${pick.kind === 'bar' ? ' selected' : ''}>Bar</option>
            <option value="line"${pick.kind === 'line' ? ' selected' : ''}>Line</option>
          </select>
        </label>
        <label><span>Aggregate</span>
          <select data-axis="aggregate">
            ${AGGREGATES.map(([value, label]) => `<option value="${value}"${value === pick.aggregate ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="chart-panel-body" id="chartBody"></div>
    `);

    drawer.querySelector('[data-action="close"]').addEventListener('click', close);
    drawer.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', () => {
        const axis = select.dataset.axis;
        if (axis === 'x') pick = { ...pick, x: select.value };
        else if (axis === 'y') {
          pick = { ...pick, y: select.value, aggregate: defaultAggregateForColumn(select.value) };
          const aggregateSelect = drawer.querySelector('[data-axis="aggregate"]');
          if (aggregateSelect) aggregateSelect.value = pick.aggregate;
        }
        else if (axis === 'kind') pick = { ...pick, kind: select.value };
        else if (axis === 'aggregate') pick = { ...pick, aggregate: normalizeAggregate(select.value) };
        renderChart();
      });
    });
    renderChart();
  }

  function renderChart() {
    const body = drawer.querySelector('#chartBody');
    if (!body || !pick) return;
    const title = drawer.querySelector('.chart-panel-heading h2');
    if (title) title.textContent = chartTitle(pick);
    const s = store.state;
    const points = collectPoints(s.resultRows, pick.x, pick.y, s.resultColumnTypes, pick.aggregate);
    if (!points.length) {
      setHtml(body, '<p class="chart-panel-empty">No numeric values for this combination.</p>');
      return;
    }
    const limited = points.slice(0, MAX_BARS);
    const truncatedNote = points.length > MAX_BARS ? `<p class="chart-panel-summary">Showing first ${MAX_BARS} of ${formatNumber(points.length)} groups.</p>` : `<p class="chart-panel-summary">${formatNumber(points.length)} ${points.length === 1 ? 'group' : 'groups'}</p>`;
    const svg = pick.kind === 'line' ? renderLineSvg(limited) : renderBarSvg(limited);
    setHtml(body, `${truncatedNote}${svg}`);
  }

  // Keep the drawer bound to the current result. A new query replaces the
  // result arrays, so recompute the automatic chart selection while open.
  store.subscribe((state) => {
    if (state.rightPanel?.type !== 'chart') {
      pick = null;
      renderedRows = null;
      renderedColumnsKey = '';
      return;
    }
    renderForResult(state);
  });

  return { open, close };
}

function autoDetect(columns, types = {}) {
  if (!columns?.length) return null;
  const numericColumns = columns.filter((c) => isNumericSqlType(types[c]));
  if (!numericColumns.length) return null;
  const temporal = columns.find((c) => isTemporalSqlType(types[c]));
  if (temporal) {
    const y = numericColumns.find((c) => c !== temporal) || numericColumns[0];
    return { kind: 'line', x: temporal, y, aggregate: defaultAggregateForColumn(y) };
  }
  // Pick the first non-numeric column as x (categorical), else first column.
  const xCandidates = columns.filter((c) => !isNumericSqlType(types[c]));
  const x = xCandidates[0] || columns[0];
  const y = numericColumns.find((c) => c !== x) || numericColumns[0];
  return { kind: 'bar', x, y, aggregate: defaultAggregateForColumn(y) };
}

function isCategoricalLike(column, rows, types) {
  if (isNumericSqlType(types?.[column])) return false;
  if (isTemporalSqlType(types?.[column])) return false;
  return true;
}

function collectPoints(rows, xKey, yKey, types, aggregate = 'sum') {
  const temporal = isTemporalSqlType(types?.[xKey]);
  const mode = normalizeAggregate(aggregate);
  const groups = new Map();
  for (const row of rows) {
    const xRaw = row?.[xKey];
    if (xRaw == null) continue;
    const xLabel = valueToDisplay(xRaw, types?.[xKey]);
    const xSort = temporal ? sortableTime(xRaw) : null;
    const y = mode === 'count' ? 1 : toNumber(row?.[yKey]);
    if (y == null) continue;
    addGroupedValue(groups, { xLabel, xSort, y, temporal });
  }
  const points = [...groups.values()].map((group) => ({
    xLabel: group.xLabel,
    xSort: group.xSort,
    y: aggregateValue(group.values, mode),
  }));
  if (temporal) points.sort((a, b) => (a.xSort ?? 0) - (b.xSort ?? 0));
  return points;
}

function addGroupedValue(groups, { xLabel, xSort, y, temporal }) {
  const existing = groups.get(xLabel);
  if (existing) {
    existing.values.push(y);
    if (temporal && xSort != null && (existing.xSort == null || xSort < existing.xSort)) existing.xSort = xSort;
    return;
  }
  groups.set(xLabel, { xLabel, xSort, values: [y] });
}

function aggregateValue(values, aggregate) {
  if (aggregate === 'count') return values.length;
  if (aggregate === 'min') return Math.min(...values);
  if (aggregate === 'max') return Math.max(...values);
  const sum = values.reduce((total, value) => total + value, 0);
  if (aggregate === 'avg') return sum / values.length;
  return sum;
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sortableTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function plotMetrics(points) {
  const ys = points.map((p) => p.y);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys, minY + 1);
  const plotW = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotH = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const yToPx = (y) => PADDING_TOP + plotH - ((y - minY) / (maxY - minY || 1)) * plotH;
  return { minY, maxY, plotW, plotH, yToPx };
}

function renderBarSvg(points) {
  const { minY, maxY, plotW, plotH, yToPx } = plotMetrics(points);
  const gap = 2;
  const slot = plotW / points.length;
  const barWidth = Math.max(2, slot - gap);
  const bars = points
    .map((point, index) => {
      const x = PADDING_LEFT + index * slot + (slot - barWidth) / 2;
      const yTop = yToPx(Math.max(point.y, 0));
      const height = Math.max(1, Math.abs(yToPx(0) - yToPx(point.y)));
      return `<rect class="bar" x="${round(x)}" y="${round(yTop)}" width="${round(barWidth)}" height="${round(height)}" rx="1.5"><title>${esc(`${point.xLabel}: ${abbreviateCount(point.y)}`)}</title></rect>`;
    })
    .join('');
  return wrapSvg(bars, axisLabels(points, minY, maxY, yToPx));
}

function renderLineSvg(points) {
  const { minY, maxY, plotW, plotH, yToPx } = plotMetrics(points);
  if (points.length < 2) return renderBarSvg(points);
  const stepX = plotW / (points.length - 1);
  const path = points
    .map((point, index) => {
      const x = PADDING_LEFT + index * stepX;
      const y = yToPx(point.y);
      return `${index === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`;
    })
    .join(' ');
  const dots = points
    .map((point, index) => {
      const x = PADDING_LEFT + index * stepX;
      const y = yToPx(point.y);
      return `<circle class="dot" cx="${round(x)}" cy="${round(y)}" r="2"><title>${esc(`${point.xLabel}: ${abbreviateCount(point.y)}`)}</title></circle>`;
    })
    .join('');
  return wrapSvg(`<path class="line" d="${path}" />${dots}`, axisLabels(points, minY, maxY, yToPx));
}

function axisLabels(points, minY, maxY, yToPx) {
  const yTicks = [minY, (minY + maxY) / 2, maxY];
  const yLabels = yTicks
    .map((tick) => `<text class="label" x="${PADDING_LEFT - 6}" y="${round(yToPx(tick) + 3)}" text-anchor="end">${esc(abbreviateCount(tick))}</text>`)
    .join('');
  const yAxis = `<line class="axis" x1="${PADDING_LEFT}" x2="${PADDING_LEFT}" y1="${PADDING_TOP}" y2="${SVG_HEIGHT - PADDING_BOTTOM}" />`;
  const xAxis = `<line class="axis" x1="${PADDING_LEFT}" x2="${SVG_WIDTH - PADDING_RIGHT}" y1="${SVG_HEIGHT - PADDING_BOTTOM}" y2="${SVG_HEIGHT - PADDING_BOTTOM}" />`;
  // Show first, middle, and last x labels only — avoids overlap on dense bars.
  const indicesToLabel = points.length <= 3 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  const slot = (SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT) / Math.max(1, points.length - (points.length > 1 ? 1 : 0));
  const xLabels = indicesToLabel
    .map((i) => {
      const x = PADDING_LEFT + i * slot;
      return `<text class="label" x="${round(x)}" y="${SVG_HEIGHT - 10}" text-anchor="middle">${esc(truncate(points[i].xLabel, 8))}</text>`;
    })
    .join('');
  return `${yAxis}${xAxis}${yLabels}${xLabels}`;
}

function wrapSvg(plot, axes) {
  return `<svg class="chart-panel-svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="Chart of result">${axes}${plot}</svg>`;
}

function chartTitle(selection) {
  if (!selection) return 'Chart';
  if (selection.aggregate === 'count') return `count by ${selection.x}`;
  return `${selection.aggregate || 'sum'} ${selection.y} by ${selection.x}`;
}

function normalizeAggregate(value) {
  return AGGREGATES.some(([id]) => id === value) ? value : 'sum';
}

function defaultAggregateForColumn(column) {
  const name = String(column || '').toLowerCase();
  if (/(^|[_\s-])(avg|average|mean|rate|ratio|percent|pct|score|length|depth|height|width|mass|weight|temperature|temp|age|price)([_\s-]|$)/.test(` ${name} `)) {
    return 'avg';
  }
  if (/(^|[_\s-])(count|rows|total|amount|revenue|sales|qty|quantity|units|cost|spend|duration)([_\s-]|$)/.test(` ${name} `)) {
    return 'sum';
  }
  return 'avg';
}

function renderEmpty(drawer, close, message = 'This result has no numeric column to plot. Try a query with at least one numeric measure.') {
  setHtml(drawer, `
    <div class="chart-panel-head">
      <div class="chart-panel-heading">
        <p class="chart-panel-kicker">Chart</p>
        <h2>No chartable columns</h2>
      </div>
      <button class="chart-panel-close" type="button" data-action="close" aria-label="Close chart">×</button>
    </div>
    <div class="chart-panel-body">
      <p class="chart-panel-empty">${esc(message)}</p>
    </div>
  `);
  drawer.querySelector('[data-action="close"]').addEventListener('click', close);
}

function resultColumnsKey(state) {
  return [
    ...(state.resultColumns || []),
    ...Object.entries(state.resultColumnTypes || {}).map(([column, type]) => `${column}:${type}`),
  ].join('\u001f');
}

function truncate(text, max) {
  const value = String(text);
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
