'use client';
// A metric against its normal band, on the kit's LineChart. The band (mean plus or minus two
// sigma) is drawn as two muted series so it reads in the tooltip too; the metric is a level, so
// the axis fits the data (zero={false}). A client component because the formatter is a function,
// which cannot cross the server boundary.
import { useMemo } from 'react';
import type { MetricSeries } from '@/lib/queries';
import { LineChart, type Row, type Series } from '@/components/charts';

// Mirrors the page's value formatting so the axis, tooltip and headline agree.
function fmtVal(key: string, v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  if (key.endsWith('_hhi')) return n.toFixed(0);
  if (key.includes('utilization') || key.endsWith('_pct')) return `${n.toFixed(1)}%`;
  if (key.startsWith('sui.') && (key.endsWith('.tvl') || key === 'sui.tvl_total')) return `$${n.toFixed(1)}M`;
  if (key.startsWith('aave.')) {
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toFixed(0)}`;
  }
  return String(Math.round(n * 100) / 100);
}

const SERIES: Series[] = [
  { key: 'value', label: 'Value', color: 'var(--chart-1)' },
  { key: 'upper', label: 'Upper band', color: 'var(--fg-dim)' },
  { key: 'lower', label: 'Lower band', color: 'var(--fg-dim)' },
];

export function MetricBandChart({ m }: { m: MetricSeries }) {
  const rows = useMemo<Row[]>(() => {
    const upper = m.mean + 2 * m.stddev;
    const lower = m.mean - 2 * m.stddev;
    return m.points.map((p) => ({ day: p.ts, value: p.value, upper, lower }));
  }, [m]);
  const series = m.stddev > 0 ? SERIES : SERIES.slice(0, 1);
  return (
    <div className="mt-2">
      <LineChart data={rows} x="day" series={series} height={96} zero={false} format={(v) => fmtVal(m.metricKey, v)} />
    </div>
  );
}
