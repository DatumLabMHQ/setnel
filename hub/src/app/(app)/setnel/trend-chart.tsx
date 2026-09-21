'use client';

import { useMemo, useState } from 'react';
import type { ChartBundle, Series } from '@/lib/queries';
import { Button } from '@/components/ui/button';

// Restrained, distinguishable palette for multi-line series, from the Datum chart tokens.
const PALETTE = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
];

type DimKey = 'collectionByDashboard' | 'alertsByDashboard' | 'alertsByCategory' | 'alertsByProtocol';
const DIMS: { key: DimKey; label: string }[] = [
  { key: 'collectionByDashboard', label: 'Collection · by dashboard' },
  { key: 'alertsByDashboard', label: 'Alerts · by dashboard' },
  { key: 'alertsByCategory', label: 'Alerts · by category' },
  { key: 'alertsByProtocol', label: 'Alerts · by protocol' },
];

export function TrendChart({ bundle }: { bundle: ChartBundle }) {
  const [dim, setDim] = useState<DimKey>('collectionByDashboard');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const series = bundle[dim];
  const days = bundle.days;

  // Reset hidden set when switching dimension.
  const onDim = (k: DimKey) => {
    setDim(k);
    setHidden(new Set());
  };
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const visible = series.filter((s) => !hidden.has(s.key));

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {DIMS.map((d) => (
          <Button
            key={d.key}
            type="button"
            size="sm"
            variant={dim === d.key ? 'secondary' : 'ghost'}
            onClick={() => onDim(d.key)}
          >
            {d.label}
          </Button>
        ))}
      </div>

      {series.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No data for this breakdown yet.
        </div>
      ) : (
        <>
          <MultiLine days={days} series={visible} allSeries={series} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {series.map((s, i) => {
              const off = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity hover:text-foreground ${off ? 'opacity-40' : ''}`}
                  onClick={() => toggle(s.key)}
                  title={off ? 'Show' : 'Hide'}
                >
                  <span className="size-2.5 rounded-[3px]" style={{ background: colorFor(series, s.key, i) }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function colorFor(all: Series[], key: string, fallbackIdx: number): string {
  const idx = all.findIndex((s) => s.key === key);
  return PALETTE[(idx >= 0 ? idx : fallbackIdx) % PALETTE.length];
}

function MultiLine({ days, series, allSeries }: { days: string[]; series: Series[]; allSeries: Series[] }) {
  const W = 900;
  const H = 240;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = useMemo(() => {
    let m = 1;
    for (const s of series) for (const v of s.values) if (v > m) m = v;
    return niceCeil(m);
  }, [series]);

  const n = days.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const xLabels = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Trend">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={padL + innerW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={11} fill="var(--fg-muted)">{abbrev(t)}</text>
        </g>
      ))}
      {xLabels.map((i) => (
        <text key={i} x={x(i)} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">{fmtDay(days[i])}</text>
      ))}
      {series.map((s) => {
        const color = colorFor(allSeries, s.key, 0);
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        return <polyline key={s.key} points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
      })}
    </svg>
  );
}

function niceCeil(v: number): number {
  if (v <= 10) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * mag;
}
function abbrev(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}
function fmtDay(iso?: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
