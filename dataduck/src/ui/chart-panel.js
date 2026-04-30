// Minimal "Chart this" panel — auto-detects the most useful x/y from a query
// result and renders a small SVG bar or line chart. Lives in the right drawer
// using the same plumbing as the column profiler. Uses no React; the goal is
// to give power users a one-click chart without going through the AI assistant.
import { setHtml, esc } from '../util/dom.js';
import { isNumericSqlType, isTemporalSqlType } from '../duckdb/sql-types.js';
import { abbreviateCount, formatNumber, valueToDisplay } from '../util/format.js';
import { closeRightPanel, ensureRightPanel, openRightPanel } from './right-panel.js';

// Default dimensions are used when the container hasn't been measured yet
// (first paint) or when ResizeObserver isn't available. The chart re-renders
// at actual container dimensions on every resize so labels never clip and
// the bar widths grow with available space.
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 220;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
// Reserve room for axis labels in viewBox units. Y labels (left) need room
// for "999K"-style abbreviations; X labels (bottom) need a single text line.
const PADDING_LEFT = 52;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 32;
const MIN_X_LABEL_SLOT = 56;   // px per label before we start dropping labels
const MIN_X_LABEL_CHARS = 8;
const MAX_X_LABEL_CHARS = 24;
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
  // Current chart-body dimensions in CSS pixels. Updated by ResizeObserver
  // every time the panel is resized via the drag handle (or when the body
  // first appears in the DOM). The SVG viewBox tracks these so labels and
  // bars get more room as the panel widens — no label cutoff at any width.
  let chartWidth = DEFAULT_WIDTH;
  let chartHeight = DEFAULT_HEIGHT;
  // Single ResizeObserver instance reused across renders. Re-attach to the
  // active body element each time the chart re-mounts (setHtml replaces it).
  const bodyResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(MIN_WIDTH, Math.floor(entry.contentRect.width));
          // Keep an aspect-ratio-ish height so wide panels also get taller charts.
          const h = Math.max(MIN_HEIGHT, Math.min(420, Math.round(w * 0.62)));
          if (w === chartWidth && h === chartHeight) continue;
          chartWidth = w;
          chartHeight = h;
          if (pick) renderChart();
        }
      })
    : null;

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
    // Snap to the current container width before drawing. The body has
    // padding, so subtract it; otherwise the SVG renders 32px wider than its
    // parent and triggers horizontal scroll.
    const measured = measureChartBody(body);
    if (measured.width >= MIN_WIDTH) chartWidth = measured.width;
    if (measured.height >= MIN_HEIGHT) chartHeight = measured.height;
    const title = drawer.querySelector('.chart-panel-heading h2');
    if (title) title.textContent = chartTitle(pick);
    const s = store.state;
    const points = collectPoints(s.resultRows, pick.x, pick.y, s.resultColumnTypes, pick.aggregate);
    if (!points.length) {
      setHtml(body, '<p class="chart-panel-empty">No numeric values for this combination.</p>');
      observeBody(body);
      return;
    }
    const limited = points.slice(0, MAX_BARS);
    const truncatedNote = points.length > MAX_BARS ? `<p class="chart-panel-summary">Showing first ${MAX_BARS} of ${formatNumber(points.length)} groups.</p>` : `<p class="chart-panel-summary">${formatNumber(points.length)} ${points.length === 1 ? 'group' : 'groups'}</p>`;
    const dims = { width: chartWidth, height: chartHeight };
    const svg = pick.kind === 'line' ? renderLineSvg(limited, dims) : renderBarSvg(limited, dims);
    setHtml(body, `${truncatedNote}${svg}`);
    observeBody(body);
  }

  function observeBody(body) {
    if (!bodyResizeObserver || !body) return;
    bodyResizeObserver.disconnect();
    bodyResizeObserver.observe(body);
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

function measureChartBody(body) {
  if (!body) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const rect = body.getBoundingClientRect();
  // Body padding from styles.css: 14px 16px 18px → subtract horizontal padding.
  const horizontalPadding = 32;
  const width = Math.max(MIN_WIDTH, Math.floor(rect.width - horizontalPadding));
  const height = Math.max(MIN_HEIGHT, Math.min(420, Math.round(width * 0.62)));
  return { width, height };
}

function plotMetrics(points, dims) {
  const ys = points.map((p) => p.y);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys, minY + 1);
  const plotW = dims.width - PADDING_LEFT - PADDING_RIGHT;
  const plotH = dims.height - PADDING_TOP - PADDING_BOTTOM;
  const yToPx = (y) => PADDING_TOP + plotH - ((y - minY) / (maxY - minY || 1)) * plotH;
  return { minY, maxY, plotW, plotH, yToPx };
}

function renderBarSvg(points, dims) {
  const { minY, maxY, plotW, yToPx } = plotMetrics(points, dims);
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
  return wrapSvg(bars, axisLabels(points, minY, maxY, yToPx, dims), dims);
}

function renderLineSvg(points, dims) {
  const { minY, maxY, plotW, yToPx } = plotMetrics(points, dims);
  if (points.length < 2) return renderBarSvg(points, dims);
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
  return wrapSvg(`<path class="line" d="${path}" />${dots}`, axisLabels(points, minY, maxY, yToPx, dims), dims);
}

function axisLabels(points, minY, maxY, yToPx, dims) {
  const plotW = dims.width - PADDING_LEFT - PADDING_RIGHT;
  const yTicks = [minY, (minY + maxY) / 2, maxY];
  const yLabels = yTicks
    .map((tick) => `<text class="label" x="${PADDING_LEFT - 8}" y="${round(yToPx(tick) + 3)}" text-anchor="end">${esc(formatTick(tick))}</text>`)
    .join('');
  const yAxis = `<line class="axis" x1="${PADDING_LEFT}" x2="${PADDING_LEFT}" y1="${PADDING_TOP}" y2="${dims.height - PADDING_BOTTOM}" />`;
  const xAxis = `<line class="axis" x1="${PADDING_LEFT}" x2="${dims.width - PADDING_RIGHT}" y1="${dims.height - PADDING_BOTTOM}" y2="${dims.height - PADDING_BOTTOM}" />`;
  // How many X labels can we comfortably fit? Each label needs ~MIN_X_LABEL_SLOT
  // px to avoid overlap. The label budget grows with panel width — at 320px
  // wide we show 3 labels (first/middle/last); at 800px wide we may show 8.
  const maxLabels = Math.max(2, Math.min(points.length, Math.floor(plotW / MIN_X_LABEL_SLOT)));
  const indicesToLabel = pickLabelIndices(points.length, maxLabels);
  // Truncate length is also responsive: more room per label = longer text.
  const slotPx = points.length > 1 ? plotW / Math.max(1, indicesToLabel.length) : plotW;
  const truncBudget = Math.max(MIN_X_LABEL_CHARS, Math.min(MAX_X_LABEL_CHARS, Math.floor(slotPx / 7)));
  const stepDenominator = Math.max(1, points.length - (points.length > 1 ? 1 : 0));
  const slot = plotW / stepDenominator;
  const xLabels = indicesToLabel
    .map((i) => {
      const x = PADDING_LEFT + i * slot;
      return `<text class="label" x="${round(x)}" y="${dims.height - 10}" text-anchor="middle">${esc(truncate(points[i].xLabel, truncBudget))}</text>`;
    })
    .join('');
  return `${yAxis}${xAxis}${yLabels}${xLabels}`;
}

function pickLabelIndices(total, maxLabels) {
  if (total <= maxLabels) return Array.from({ length: total }, (_, i) => i);
  if (maxLabels <= 1) return [Math.floor(total / 2)];
  const out = [];
  const step = (total - 1) / (maxLabels - 1);
  for (let i = 0; i < maxLabels; i += 1) out.push(Math.round(i * step));
  return out;
}

function wrapSvg(plot, axes, dims) {
  // overflow="visible" prevents any sub-pixel rounding at the viewBox edge
  // from clipping label glyphs. The chart container doesn't visibly bleed
  // because the body has its own padding + the SVG has a 1px border.
  return `<svg class="chart-panel-svg" viewBox="0 0 ${dims.width} ${dims.height}" role="img" aria-label="Chart of result" overflow="visible">${axes}${plot}</svg>`;
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

// Format an axis tick value for display. abbreviateCount handles large values
// nicely ("1.2M", "5K") but returns String(n) verbatim for n < 1000, which
// surfaces floating-point noise like "24.300000000000004" when an aggregate
// is an average. Round small floats to a sane precision, drop trailing zeros.
function formatTick(value) {
  if (value == null || !Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs >= 1000) return abbreviateCount(value);
  if (Number.isInteger(value)) return String(value);
  // Pick precision based on magnitude: < 1 → 3 digits, < 10 → 2, otherwise 1.
  const precision = abs < 1 ? 3 : abs < 10 ? 2 : 1;
  return Number(value.toFixed(precision)).toString();
}
