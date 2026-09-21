'use client';
// Console trends on the kit's LineChart (shadcn chart recipe over Recharts 3, Datum tokens).
// Counts per day, so LineChart per docs/CHARTS.md; the breakdown switch and the click-to-hide
// legend are Setnel's, the chart itself is the standard one.
import { useMemo, useState } from 'react';
import type { ChartBundle, Series } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { LineChart, type Row, type Series as ChartSeries } from '@/components/charts';

type DimKey = 'collectionByDashboard' | 'alertsByDashboard' | 'alertsByCategory' | 'alertsByProtocol';
const DIMS: { key: DimKey; label: string }[] = [
  { key: 'collectionByDashboard', label: 'Collection · by dashboard' },
  { key: 'alertsByDashboard', label: 'Alerts · by dashboard' },
  { key: 'alertsByCategory', label: 'Alerts · by category' },
  { key: 'alertsByProtocol', label: 'Alerts · by protocol' },
];

// A series keeps its colour whether or not its neighbours are hidden: colour by position in the
// full list, not in the visible one.
const colorAt = (i: number) => `var(--chart-${(i % 8) + 1})`;

export function TrendChart({ bundle }: { bundle: ChartBundle }) {
  const [dim, setDim] = useState<DimKey>('collectionByDashboard');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const all: Series[] = bundle[dim];
  const days = bundle.days;

  const onDim = (k: DimKey) => { setDim(k); setHidden(new Set()); };
  const toggle = (key: string) =>
    setHidden((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  // Kit shape: one row per day with a number per series key.
  const rows = useMemo<Row[]>(
    () => days.map((day, i) => ({ day, ...Object.fromEntries(all.map((s) => [s.key, s.values[i] ?? 0])) })),
    [days, all],
  );
  const series: ChartSeries[] = all
    .map((s, i) => ({ key: s.key, label: s.label, color: colorAt(i) }))
    .filter((s) => !hidden.has(s.key));

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {DIMS.map((d) => (
          <Button key={d.key} type="button" size="sm" variant={dim === d.key ? 'secondary' : 'ghost'} onClick={() => onDim(d.key)}>
            {d.label}
          </Button>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No data for this breakdown yet.
        </div>
      ) : (
        <>
          {series.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Every line is hidden. Click a legend entry to show it.
            </div>
          ) : (
            <LineChart data={rows} x="day" series={series} unit="count" height={260} curve="monotone" />
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {all.map((s, i) => {
              const off = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={!off}
                  className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity hover:text-foreground ${off ? 'opacity-40' : ''}`}
                  onClick={() => toggle(s.key)}
                  title={off ? 'Show' : 'Hide'}
                >
                  <span className="size-2.5 rounded-[3px]" style={{ background: colorAt(i) }} />
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
