import React from 'react';
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

export function ChartCard({ analysis }) {
  const chart = analysis?.chart;
  const rows = normalizeChartRows(analysis?.rows || [], analysis?.columns || []);
  if (!chart || chart.kind === 'table' || !rows.length || !chart.series?.length) return null;

  const height = Math.max(220, Math.min(360, rows.length * 36));
  const xKey = chart.x || analysis.columns?.[0];
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval={0} angle={rows.length > 6 ? -35 : 0} textAnchor={rows.length > 6 ? 'end' : 'middle'} height={rows.length > 6 ? 72 : 36} />
      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
      {chart.series.some((series) => series.axis === 'right') ? <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} /> : null}
      <Tooltip />
      <Legend />
    </>
  );

  return (
    <div className="assistant-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart(chart, rows, common)}
      </ResponsiveContainer>
    </div>
  );
}

function renderChart(chart, rows, common) {
  if (chart.kind === 'line') {
    return (
      <LineChart data={rows}>
        {common}
        {chart.series.map((series) => <Line key={series.field} yAxisId={series.axis} type="monotone" dataKey={series.field} name={series.label} strokeWidth={2} dot={false} />)}
      </LineChart>
    );
  }
  if (chart.kind === 'scatter') {
    return (
      <ScatterChart data={rows}>
        {common}
        {chart.series.map((series) => <Scatter key={series.field} yAxisId={series.axis} dataKey={series.field} name={series.label} />)}
      </ScatterChart>
    );
  }
  if (chart.kind === 'combo') {
    return (
      <ComposedChart data={rows}>
        {common}
        {chart.series.map((series) =>
          series.mark === 'line'
            ? <Line key={series.field} yAxisId={series.axis} type="monotone" dataKey={series.field} name={series.label} strokeWidth={2} />
            : <Bar key={series.field} yAxisId={series.axis} dataKey={series.field} name={series.label} />,
        )}
      </ComposedChart>
    );
  }
  return (
    <BarChart data={rows}>
      {common}
      {chart.series.map((series) => <Bar key={series.field} yAxisId={series.axis} dataKey={series.field} name={series.label} />)}
    </BarChart>
  );
}
