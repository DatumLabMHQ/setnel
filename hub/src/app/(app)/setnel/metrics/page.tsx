import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getMetricsOverview, type MetricSeries } from '@/lib/queries';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

export default async function MetricsPage() {
  if (!(await isAuthed())) redirect('/login');
  const metrics = await getMetricsOverview(200);

  // Group by dashboard.
  const byDash = new Map<string, MetricSeries[]>();
  for (const m of metrics) {
    const list = byDash.get(m.dashboardName) ?? [];
    list.push(m);
    byDash.set(m.dashboardName, list);
  }

  return (
    <>
      <PageHeader
        eyebrow="Metrics"
        question="Is anything drifting out of range?"
        answer="Every tracked metric, grouped by dashboard, with its latest value against the normal band (mean plus or minus two sigma). A dot outside the band is worth a look."
      />

      {byDash.size === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyTitle>No samples yet</EmptyTitle>
              <EmptyDescription>Metric samples accumulate as detectors run.</EmptyDescription>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        [...byDash.entries()].map(([name, list]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle>{name}</CardTitle>
              <CardDescription>{list.length} metrics, the grey band is the normal range (mean plus or minus two sigma).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((m) => (
                  <div className="rounded-lg border border-border p-3" key={m.metricKey}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-xs text-muted-foreground">{m.metricKey}</span>
                      <span className="font-mono text-sm tabular-nums">{fmtVal(m.metricKey, m.latest)}</span>
                    </div>
                    <BandChart m={m} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}

function fmtVal(key: string, v: number): string {
  if (key.endsWith('_hhi')) return v.toFixed(0);
  if (key.includes('utilization') || key.endsWith('_pct')) return `${v.toFixed(1)}%`;
  if (key.startsWith('sui.') && (key.endsWith('.tvl') || key === 'sui.tvl_total')) return `$${v.toFixed(1)}M`;
  if (key.startsWith('aave.')) {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    return `$${v.toFixed(0)}`;
  }
  return String(Math.round(v * 100) / 100);
}

// Line chart with the baseline band (mean ±2σ) shaded, "is the current value
// inside its normal range?" at a glance.
function BandChart({ m }: { m: MetricSeries }) {
  const W = 300, H = 84, pad = 6;
  const vals = m.points.map((p) => p.value);
  const bandLo = m.mean - 2 * m.stddev;
  const bandHi = m.mean + 2 * m.stddev;
  const lo = Math.min(...vals, bandLo);
  const hi = Math.max(...vals, bandHi);
  const range = hi - lo || 1;
  const n = m.points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / range) * (H - 2 * pad);
  const line = m.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const bandTop = y(bandHi);
  const bandBot = y(bandLo);
  const last = m.points[n - 1].value;
  const outOfBand = last > bandHi || last < bandLo;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-16 w-full" preserveAspectRatio="none">
      {m.stddev > 0 ? <rect x={pad} y={bandTop} width={W - 2 * pad} height={Math.max(1, bandBot - bandTop)} fill="var(--fg-muted)" fillOpacity={0.12} /> : null}
      <line x1={pad} x2={W - pad} y1={y(m.mean)} y2={y(m.mean)} stroke="var(--fg-muted)" strokeWidth={0.7} strokeDasharray="3 3" />
      <polyline points={line} fill="none" stroke="var(--fg)" strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(last)} r={3} fill={outOfBand ? 'var(--critical)' : 'var(--fg)'} />
    </svg>
  );
}
