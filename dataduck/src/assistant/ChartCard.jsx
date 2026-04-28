import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { normalizeChartRows } from './normalize-chart-data.js';
import { valueToDisplay } from '../util/format.js';

export const MAX_CHART_ROWS = 120;

const FALLBACK_PALETTE = ['#1a4d44', '#0a7f6b', '#7a5cff', '#c97700', '#1d6cda', '#b42318'];

function readThemeColors() {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return { palette: FALLBACK_PALETTE };
  }
  const styles = getComputedStyle(document.documentElement);
  const get = (name, fallback) => {
    const value = (styles.getPropertyValue(name) || '').trim();
    return value || fallback;
  };
  const accent = get('--accent', FALLBACK_PALETTE[0]);
  return {
    palette: [
      accent,
      get('--num', FALLBACK_PALETTE[1]),
      get('--fn', FALLBACK_PALETTE[2]),
      FALLBACK_PALETTE[3],
      FALLBACK_PALETTE[4],
      FALLBACK_PALETTE[5],
    ],
  };
}

export function chartIsRenderable(analysis) {
  if (!analysis) return false;
  const chart = analysis.chart;
  if (!chart || chart.kind === 'table' || !chart.series?.length) return false;
  const rows = analysis.rows || [];
  return rows.length >= 2;
}

export function ChartCard({ analysis }) {
  const chart = analysis?.chart;
  const selectedRows = useMemo(
    () => selectChartRows(normalizeChartRows(analysis?.rows || [], analysis?.columns || [])),
    [analysis?.rows, analysis?.columns],
  );
  const rows = selectedRows.rows;
  const [colors, setColors] = useState(() => readThemeColors());

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => setColors(readThemeColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  if (!chart || chart.kind === 'table' || !chart.series?.length || !rows.length) return null;

  if (rows.length === 1 && chart.kind !== 'scatter') {
    const series = chart.series[0];
    const xKey = chart.x;
    const value = rows[0]?.[series.field];
    const label = xKey && xKey !== series.field ? rows[0]?.[xKey] : null;
    return (
      <div className="assistant-kpi">
        <span className="assistant-kpi-label">{series.label || series.field}</span>
        <span className="assistant-kpi-value">{valueToDisplay(value)}</span>
        {label != null && label !== '' ? <span className="assistant-kpi-context">{String(label)}</span> : null}
      </div>
    );
  }

  const height = Math.max(240, Math.min(360, rows.length * 28));
  const xKey = chart.x || analysis.columns?.[0];
  const interval = rows.length > 60 ? 'preserveStartEnd' : rows.length > 20 ? Math.ceil(rows.length / 20) - 1 : 0;
  const showLegend = chart.series.length > 1;
  const hasRightAxis = chart.series.some((series) => series.axis === 'right');
  const longestLabel = rows.reduce((max, row) => Math.max(max, String(row?.[xKey] ?? '').length), 0);
  const angleLabels = rows.length > 4 || longestLabel > 6;

  const common = (
    <>
      <CartesianGrid strokeDasharray="2 4" stroke="currentColor" opacity={0.18} vertical={false} />
      <XAxis
        dataKey={xKey}
        tick={{ fontSize: 10.5, fill: 'currentColor' }}
        interval={interval}
        angle={angleLabels ? -28 : 0}
        textAnchor={angleLabels ? 'end' : 'middle'}
        height={angleLabels ? 64 : 30}
        tickLine={false}
        axisLine={{ stroke: 'currentColor', opacity: 0.22 }}
      />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 10.5, fill: 'currentColor' }}
        tickLine={false}
        axisLine={false}
        width={48}
      />
      {hasRightAxis ? (
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 10.5, fill: 'currentColor' }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
      ) : null}
      <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
      {showLegend ? <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} /> : null}
    </>
  );

  return (
    <>
      <div className="assistant-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart, rows, common, colors)}
        </ResponsiveContainer>
      </div>
      {selectedRows.truncated ? (
        <p className="assistant-chart-note">Chart limited to first {MAX_CHART_ROWS} rows.</p>
      ) : null}
    </>
  );
}

export function selectChartRows(rows = [], maxRows = MAX_CHART_ROWS) {
  const limit = Math.max(1, Number(maxRows) || MAX_CHART_ROWS);
  return {
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
  };
}

function renderChart(chart, rows, common, colors) {
  const colorFor = (i) => colors.palette[i % colors.palette.length];
  const margin = { top: 8, right: 12, left: 0, bottom: 4 };

  if (chart.kind === 'line') {
    return (
      <LineChart data={rows} margin={margin}>
        {common}
        {chart.series.map((series, i) => (
          <Line
            key={series.field}
            yAxisId={series.axis}
            type="monotone"
            dataKey={series.field}
            name={series.label}
            strokeWidth={2}
            dot={false}
            stroke={colorFor(i)}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    );
  }
  if (chart.kind === 'scatter') {
    return (
      <ScatterChart data={rows} margin={margin}>
        {common}
        {chart.series.map((series, i) => (
          <Scatter
            key={series.field}
            yAxisId={series.axis}
            dataKey={series.field}
            name={series.label}
            fill={colorFor(i)}
          />
        ))}
      </ScatterChart>
    );
  }
  if (chart.kind === 'combo') {
    return (
      <ComposedChart data={rows} margin={margin}>
        {common}
        {chart.series.map((series, i) =>
          series.mark === 'line' ? (
            <Line
              key={series.field}
              yAxisId={series.axis}
              type="monotone"
              dataKey={series.field}
              name={series.label}
              strokeWidth={2}
              dot={false}
              stroke={colorFor(i)}
            />
          ) : (
            <Bar
              key={series.field}
              yAxisId={series.axis}
              dataKey={series.field}
              name={series.label}
              fill={colorFor(i)}
              radius={0}
              maxBarSize={36}
            />
          ),
        )}
      </ComposedChart>
    );
  }
  return (
    <BarChart data={rows} margin={margin}>
      {common}
      {chart.series.map((series, i) => (
        <Bar
          key={series.field}
          yAxisId={series.axis}
          dataKey={series.field}
          name={series.label}
          fill={colorFor(i)}
          radius={0}
          maxBarSize={36}
        />
      ))}
    </BarChart>
  );
}
