import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getMetricsOverview, type MetricSeries } from '@/lib/queries';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { MetricBandChart } from './metric-band-chart';

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
                    <MetricBandChart m={m} />
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

