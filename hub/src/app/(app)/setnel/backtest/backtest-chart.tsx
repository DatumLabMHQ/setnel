'use client';
// A metric's history with the points the adaptive rule would have alerted on, on the kit's
// LineChart. Fires are a second, sparse series in the critical colour: null everywhere except
// where the rule fired, so only those points draw (dots on, no line between them). The metric is a
// level, so the axis fits the data.
import { useMemo } from 'react';
import type { MetricSeries } from '@/lib/queries';
import { LineChart, type Row, type Series } from '@/components/charts';

const SERIES: Series[] = [
  { key: 'value', label: 'Value', color: 'var(--chart-1)' },
  { key: 'fired', label: 'Would alert', color: 'var(--critical)' },
];

export function BacktestChart({ m, fired }: { m: MetricSeries; fired: number[] }) {
  const rows = useMemo(() => {
    const firedSet = new Set(fired);
    return m.points.map((p, i) => ({ day: p.ts, value: p.value, fired: firedSet.has(i) ? p.value : null })) as unknown as Row[];
  }, [m, fired]);
  const series = fired.length ? SERIES : SERIES.slice(0, 1);
  return <LineChart data={rows} x="day" series={series} height={96} zero={false} dots={fired.length > 0} format={(v) => (v == null ? 'n/a' : String(Math.round(Number(v) * 100) / 100))} />;
}
