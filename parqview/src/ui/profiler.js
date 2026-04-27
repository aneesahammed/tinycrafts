import { setHtml, esc, spinner } from '../util/dom.js';
import { abbreviateCount, formatNumber, valueToDisplay } from '../util/format.js';
import { quoteIdentifier } from '../util/sql-quote.js';

const DEFAULT_BUCKETS = 18;
const SVG_WIDTH = 240;
const SVG_HEIGHT = 68;

export function buildHistogramBars(rows = [], bucketCount = DEFAULT_BUCKETS) {
  const count = Math.max(1, Number(bucketCount) || DEFAULT_BUCKETS);
  const slots = Array.from({ length: count }, (_, bucket) => ({ bucket, count: 0 }));

  for (const row of rows) {
    const bucket = Math.trunc(Number(row.bucket));
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= count) continue;
    const value = normalizeCount(row.count);
    slots[bucket].count += value;
  }

  const max = Math.max(1, ...slots.map((row) => row.count));
  return slots.map((row) => ({ ...row, ratio: row.count / max }));
}

export function mountProfiler(el, store, handlers) {
  const drawer = document.createElement('aside');
  drawer.className = 'profile-drawer';
  drawer.hidden = true;
  drawer.setAttribute('aria-label', 'Column profile');
  el.appendChild(drawer);

  let activeRequest = 0;
  let current = null;

  const close = () => {
    current = null;
    activeRequest += 1;
    drawer.hidden = true;
    setHtml(drawer, '');
  };

  const open = async (payload) => {
    const requestId = activeRequest + 1;
    activeRequest = requestId;
    current = payload;
    drawer.hidden = false;
    renderLoading(drawer, payload, close);

    try {
      const profile = await handlers.loadProfile(payload);
      if (requestId !== activeRequest) return;
      current = profile;
      renderProfile(drawer, profile, handlers, close);
    } catch (error) {
      if (requestId !== activeRequest) return;
      renderError(drawer, payload, error, close);
    }
  };

  store.subscribe((state) => {
    if (!current) return;
    if (!state.activeTable || current.table !== state.activeTable || !state.files.has(current.table)) close();
  });

  return { open, close };
}

function renderLoading(drawer, payload, close) {
  setHtml(drawer, `
    <div class="profile-head">
      <div>
        <p class="profile-kicker">Column profile</p>
        <h2 class="profile-title">${esc(payload.column)}</h2>
      </div>
      <button class="profile-close" type="button" data-profile-action="close" aria-label="Close column profile">×</button>
    </div>
    <div class="profile-loading">
      ${spinner()}
      <span>Building profile</span>
    </div>
  `);
  drawer.querySelector('[data-profile-action="close"]').addEventListener('click', close);
}

function renderProfile(drawer, profile, handlers, close) {
  const chart = profile.kind === 'histogram' ? renderHistogram(profile.bins) : renderTopValues(profile.values);
  setHtml(drawer, `
    <div class="profile-head">
      <div class="profile-heading">
        <p class="profile-kicker">${esc(profile.type || 'Column')}</p>
        <h2 class="profile-title">${esc(profile.column)}</h2>
      </div>
      <button class="profile-close" type="button" data-profile-action="close" aria-label="Close column profile">×</button>
    </div>
    <div class="profile-stats">
      ${statCell('Rows', formatNumber(profile.stats?.rowCount))}
      ${statCell('Distinct', formatNumber(profile.stats?.distinct))}
      ${statCell('Nulls', formatNulls(profile.stats))}
      ${statCell('Range', formatRange(profile.stats))}
    </div>
    <div class="profile-chart-wrap">
      <div class="profile-chart-head">
        <span>${profile.kind === 'histogram' ? 'Distribution' : 'Top values'}</span>
        <b>${profile.kind === 'histogram' ? 'SVG histogram' : `${profile.values?.length || 0} values`}</b>
      </div>
      ${chart}
    </div>
    <div class="profile-actions">
      <button type="button" data-profile-action="query">Query</button>
      <button type="button" data-profile-action="group">Group count</button>
      <button type="button" data-profile-action="filter">Filter non-null</button>
    </div>
  `);

  drawer.querySelector('[data-profile-action="close"]').addEventListener('click', close);
  drawer.querySelector('[data-profile-action="query"]').addEventListener('click', () => {
    handlers.setSql(`SELECT ${quoteIdentifier(profile.column)}\nFROM ${quoteIdentifier(profile.table)}\nLIMIT 500;`);
  });
  drawer.querySelector('[data-profile-action="group"]').addEventListener('click', () => {
    handlers.setSql(
      `SELECT ${quoteIdentifier(profile.column)}, COUNT(*) AS rows\nFROM ${quoteIdentifier(profile.table)}\nGROUP BY 1\nORDER BY rows DESC\nLIMIT 100;`,
    );
  });
  drawer.querySelector('[data-profile-action="filter"]').addEventListener('click', () => {
    handlers.setSql(
      `SELECT *\nFROM ${quoteIdentifier(profile.table)}\nWHERE ${quoteIdentifier(profile.column)} IS NOT NULL\nLIMIT 500;`,
    );
  });
}

function renderError(drawer, payload, error, close) {
  setHtml(drawer, `
    <div class="profile-head">
      <div>
        <p class="profile-kicker">Column profile</p>
        <h2 class="profile-title">${esc(payload.column)}</h2>
      </div>
      <button class="profile-close" type="button" data-profile-action="close" aria-label="Close column profile">×</button>
    </div>
    <div class="profile-error">
      <b>Could not profile this column.</b>
      <span>${esc(error?.message || error || 'Unknown error')}</span>
    </div>
  `);
  drawer.querySelector('[data-profile-action="close"]').addEventListener('click', close);
}

function statCell(label, value) {
  return `<div class="profile-stat"><span>${esc(label)}</span><b>${esc(value || '-')}</b></div>`;
}

function renderHistogram(rows = []) {
  const bucketCount = Math.max(DEFAULT_BUCKETS, maxBucket(rows) + 1);
  const bars = buildHistogramBars(rows, bucketCount);
  const gap = 2;
  const barWidth = (SVG_WIDTH - gap * (bars.length - 1)) / bars.length;
  const rects = bars
    .map((bar, index) => {
      const height = bar.count ? Math.max(3, Math.round(bar.ratio * SVG_HEIGHT)) : 1;
      const x = index * (barWidth + gap);
      const y = SVG_HEIGHT - height;
      return `<rect x="${round(x)}" y="${y}" width="${round(barWidth)}" height="${height}" rx="1.5"><title>${esc(`${abbreviateCount(bar.count)} rows`)}</title></rect>`;
    })
    .join('');

  return `
    <svg class="profile-chart" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="Column value histogram">
      ${rects}
    </svg>
  `;
}

function renderTopValues(values = []) {
  if (!values.length) return '<p class="profile-empty">No non-null values found.</p>';
  const max = Math.max(1, ...values.map((row) => normalizeCount(row.count)));
  return `
    <div class="profile-values">
      ${values
        .map((row) => {
          const count = normalizeCount(row.count);
          const width = Math.max(2, Math.round((count / max) * 100));
          return `
            <div class="profile-value">
              <span class="profile-value-name">${esc(valueToDisplay(row.value))}</span>
              <span class="profile-value-bar"><i style="width:${width}%"></i></span>
              <b>${esc(abbreviateCount(count))}</b>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function formatRange(stats = {}) {
  if (stats.min == null && stats.max == null) return '-';
  if (stats.min === stats.max) return valueToDisplay(stats.min);
  return `${valueToDisplay(stats.min)} → ${valueToDisplay(stats.max)}`;
}

function formatNulls(stats = {}) {
  if (stats.nullPercentage != null) return `${formatNumber(round(Number(stats.nullPercentage), 2))}%`;
  if (stats.nullCount != null) return formatNumber(stats.nullCount);
  if (stats.nulls == null) return '-';
  const nullValue = Number(stats.nulls);
  if (Number.isFinite(nullValue) && nullValue >= 0 && nullValue <= 100) return `${formatNumber(round(nullValue, 2))}%`;
  return formatNumber(stats.nulls);
}

function maxBucket(rows = []) {
  return rows.reduce((max, row) => Math.max(max, Math.trunc(Number(row.bucket)) || 0), 0);
}

function normalizeCount(value) {
  if (typeof value === 'bigint') return Number(value);
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value, decimals = 2) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
