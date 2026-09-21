'use client';
// Weekly report trends on the kit's BarChart: one value per week, few periods, so a bar per week
// per docs/CHARTS.md. A client component because each panel's formatter is a function, which
// cannot cross the server boundary; the page passes plain week rows.
import type { WeekRow } from '@/lib/admin';
import { BarChart, type Row } from '@/components/charts';

type Panel = { title: string; pick: (w: WeekRow) => number | null; fmt: (v: unknown) => string };
const PANELS: Panel[] = [
  { title: 'Incidents per week', pick: (w) => w.incidents, fmt: (v) => (v == null ? 'n/a' : String(v)) },
  { title: 'Time to ack (min)', pick: (w) => w.mttaMin, fmt: (v) => (v == null ? 'n/a' : `${Math.round(Number(v))}m`) },
  { title: 'Time to resolve (min)', pick: (w) => w.mttrMin, fmt: (v) => (v == null ? 'n/a' : `${Math.round(Number(v))}m`) },
  { title: 'False positive %', pick: (w) => (w.incidents ? Math.round((w.falsePositives / w.incidents) * 100) : 0), fmt: (v) => (v == null ? 'n/a' : `${v}%`) },
];

export function WeeklyTrends({ weeks }: { weeks: WeekRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PANELS.map((p) => {
        const vals = weeks.map(p.pick);
        const latest = vals[vals.length - 1] ?? null;
        // Recharts leaves a gap for null, which is what a week with no ack or resolve deserves.
        const rows = weeks.map((w, i) => ({ week: w.week, value: vals[i] })) as unknown as Row[];
        return (
          <div key={p.title} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">{p.title}</span>
              <span className="font-mono text-sm tabular-nums">{p.fmt(latest)}</span>
            </div>
            <BarChart data={rows} x="week" series={[{ key: 'value', label: p.title, color: 'var(--chart-1)' }]} height={120} format={p.fmt} />
          </div>
        );
      })}
    </div>
  );
}
