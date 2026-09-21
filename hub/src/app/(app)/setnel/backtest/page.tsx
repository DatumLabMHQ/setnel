import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getMetricsOverview, type MetricSeries } from '@/lib/queries';
import { backtestFires } from '@/lib/detect';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

const Z = 3, MIN_PCT = 8, MIN_SAMPLES = 20, WINDOW = 400;

export default async function BacktestPage() {
  if (!(await isAuthed())) redirect('/login');
  const metrics = await getMetricsOverview(200);
  const results = metrics.map((m) => ({ m, fired: backtestFires(m.points.map((p) => p.value), { z: Z, minPct: MIN_PCT, window: WINDOW, minSamples: MIN_SAMPLES }) }));

  return (
    <>
      <PageHeader
        eyebrow="Backtest"
        question="Would these thresholds have fired?"
        answer={`Replaying the adaptive rule (|z| over ${Z}, move over ${MIN_PCT} percent) across stored history. Red marks a point where an alert would have gone out. Many fires on one metric means the threshold is too sensitive for its volatility; zero across a known event means it is too loose.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Threshold backtest</CardTitle>
          <CardDescription>One panel per metric, oldest to newest. The count shows how many points would have alerted over the window.</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <Empty>
              <EmptyTitle>Not enough history yet</EmptyTitle>
              <EmptyDescription>The backtest needs more samples per metric before it can replay the rule.</EmptyDescription>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(({ m, fired }) => {
                const tone = m.points.length <= MIN_SAMPLES ? 'text-muted-foreground' : fired.length > 3 ? 'text-(--critical)' : fired.length > 0 ? 'text-(--warning)' : 'text-(--good)';
                return (
                  <div key={`${m.dashboardId}.${m.metricKey}`} className="rounded-lg border border-border p-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-xs">{m.metricKey}</span>
                      <span className={`font-mono text-xs tabular-nums ${tone}`}>
                        {m.points.length <= MIN_SAMPLES ? 'low data' : `${fired.length} fires`}
                      </span>
                    </div>
                    <BtChart m={m} fired={fired} />
                    <div className="mt-1 text-xs text-muted-foreground">{m.dashboardName} · {m.points.length} samples</div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 max-w-[72ch] text-xs text-muted-foreground">
            Tune <code className="rounded bg-muted px-1 py-0.5 font-mono">SETNEL_BASELINE_Z</code> and{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">SETNEL_BASELINE_MIN_PCT</code> then re-check.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function BtChart({ m, fired }: { m: MetricSeries; fired: number[] }) {
  const W = 300, H = 84, pad = 6;
  const vals = m.points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const n = m.points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / range) * (H - 2 * pad);
  const line = m.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const firedSet = new Set(fired);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-foreground" preserveAspectRatio="none">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      {m.points.map((p, i) => (firedSet.has(i) ? <circle key={i} cx={x(i)} cy={y(p.value)} r={2.6} fill="var(--critical)" /> : null))}
    </svg>
  );
}
