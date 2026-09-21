import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/ssr';
import { isAuthed } from '@/lib/session';
import { getHealthMatrix, getIncidents, getMetricsForDashboard, type MetricSeries } from '@/lib/queries';
import { getDashboardsAdmin, getDetectorRegistry } from '@/lib/admin';
import { fmtMetric } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { DetailLayout } from '@/components/detail-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IncidentCard, timeAgo } from '../../incident-card';

export const dynamic = 'force-dynamic';

const CELL = [
  'var(--muted)',
  'color-mix(in oklab, var(--good) 30%, transparent)',
  'color-mix(in oklab, var(--good) 60%, transparent)',
  'var(--good)',
];
const cellLevel = (checks: number) => (checks <= 0 ? 0 : checks < 60 ? 1 : checks < 200 ? 2 : 3);

const STATUS: Record<string, { dot: string; text: string }> = {
  healthy: { dot: 'bg-(--good)', text: 'text-(--good)' },
  stale: { dot: 'bg-(--warning)', text: 'text-(--warning)' },
  down: { dot: 'bg-(--critical)', text: 'text-(--critical)' },
};

export default async function DashboardDrill({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) redirect('/login');
  const { id } = await params;

  const [health, dashboards, incidents, myMetrics, detectors] = await Promise.all([
    getHealthMatrix(),
    getDashboardsAdmin(),
    getIncidents({ dashboardId: id, status: 'all' }),
    getMetricsForDashboard(id),
    getDetectorRegistry(),
  ]);

  const dash = dashboards.find((d) => d.id === id);
  const h = health.find((x) => x.id === id);
  if (!dash) notFound();

  const active = incidents.filter((i) => i.status === 'active');
  const myDetectors = detectors.filter((d) => d.dashboardId === id);
  const status = STATUS[h?.status ?? 'down'] ?? STATUS.down;

  const main = (
    <>
      {h ? (
        <Card>
          <CardHeader>
            <CardTitle>Collection</CardTitle>
            <CardDescription>Last {h.cells.length} days. Green marks a day with data, grey a gap.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1">
              {h.cells.map((c) => (
                <span key={c.day} title={`${c.day}: ${c.checks}`} className="h-8 flex-1 rounded-[2px]" style={{ backgroundColor: CELL[cellLevel(c.checks)] }} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active incidents</CardTitle>
          <CardDescription>Open incidents on this dashboard right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <Empty>
              <EmptyTitle>All clear</EmptyTitle>
              <EmptyDescription>No active incidents on this dashboard.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {active.map((i) => <IncidentCard key={i.id} i={i} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
          <CardDescription>Latest value against its normal range, the grey band is mean plus or minus two sigma.</CardDescription>
        </CardHeader>
        <CardContent>
          {myMetrics.length === 0 ? (
            <Empty>
              <EmptyTitle>No samples yet</EmptyTitle>
              <EmptyDescription>Metric samples accumulate as detectors run here.</EmptyDescription>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {myMetrics.map((m) => (
                <div className="rounded-lg border border-border p-3" key={m.metricKey}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs text-muted-foreground">{m.metricKey}</span>
                    <span className="font-mono text-sm tabular-nums">{fmtMetric(m.metricKey, m.latest)}</span>
                  </div>
                  <Band m={m} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detectors</CardTitle>
          <CardDescription>Rules watching this dashboard, with their 90-day activity.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {myDetectors.length === 0 ? (
            <div className="px-4 lg:px-6">
              <Empty>
                <EmptyTitle>No detectors yet</EmptyTitle>
                <EmptyDescription>Nothing has fired on this dashboard.</EmptyDescription>
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Detector</TableHead>
                    <TableHead className="text-right">90-day fires</TableHead>
                    <TableHead className="text-right">False pos.</TableHead>
                    <TableHead className="text-right">Last seen</TableHead>
                    <TableHead className="text-right">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myDetectors.map((d) => (
                    <TableRow key={d.detectorId}>
                      <TableCell>
                        <Link href={`/setnel/detectors/${d.dashboardId}/${encodeURIComponent(d.detectorId)}`} className="font-mono text-xs hover:underline">{d.detectorId}</Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{d.total}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{d.falsePositives}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{timeAgo(d.lastSeen)}</TableCell>
                      <TableCell className="text-right">
                        {d.enabled
                          ? <Badge className="bg-(--good-soft) text-(--good) border-transparent">on</Badge>
                          : <Badge variant="secondary">off</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  const aside = (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
        <CardDescription>Where this surface stands and where to go next.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <Fact label="Status">
          <span className={`inline-flex items-center gap-1.5 font-medium capitalize ${status.text}`}>
            <span className={`size-2 rounded-full ${status.dot}`} />{h?.status ?? 'unknown'}
          </span>
        </Fact>
        <Fact label="Last check">{timeAgo(h?.lastCheckAt ?? null)}</Fact>
        <Fact label="Check-ins today"><span className="font-mono tabular-nums">{h?.checksToday ?? 0}</span></Fact>
        <Fact label="Active incidents">
          <span className={`font-mono tabular-nums ${active.length ? 'text-(--warning)' : 'text-(--good)'}`}>{active.length}</span>
        </Fact>
        <Fact label="Metrics"><span className="font-mono tabular-nums">{myMetrics.length}</span></Fact>
        <Fact label="Detectors"><span className="font-mono tabular-nums">{myDetectors.length}</span></Fact>

        <Separator />

        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" className="justify-start" render={<a href={dash.baseUrl} target="_blank" rel="noreferrer" />}>
            <ArrowSquareOutIcon data-icon="inline-start" />Open dashboard
          </Button>
          <Button variant="ghost" size="sm" className="justify-start" render={<Link href={`/setnel/incidents?dashboard=${id}`} />}>Triage incidents</Button>
          <Button variant="ghost" size="sm" className="justify-start" render={<Link href="/setnel/metrics" />}>Metrics explorer</Button>
          <Button variant="ghost" size="sm" className="justify-start" render={<Link href="/setnel/detectors" />}>Configure detectors</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader eyebrow="Dashboard" question={dash.name} answer="Collection health, open incidents, metric baselines, and the detectors watching this surface." />
      <DetailLayout main={main} aside={aside} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Band({ m }: { m: MetricSeries }) {
  const W = 300, H = 84, pad = 6;
  const vals = m.points.map((p) => p.value);
  const bandLo = m.mean - 2 * m.stddev, bandHi = m.mean + 2 * m.stddev;
  const lo = Math.min(...vals, bandLo), hi = Math.max(...vals, bandHi);
  const range = hi - lo || 1;
  const n = m.points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / range) * (H - 2 * pad);
  const line = m.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = m.points[n - 1].value;
  const outOfBand = last > bandHi || last < bandLo;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-16 w-full" preserveAspectRatio="none">
      {m.stddev > 0 ? <rect x={pad} y={y(bandHi)} width={W - 2 * pad} height={Math.max(1, y(bandLo) - y(bandHi))} fill="var(--fg-muted)" fillOpacity={0.12} /> : null}
      <line x1={pad} x2={W - pad} y1={y(m.mean)} y2={y(m.mean)} stroke="var(--fg-muted)" strokeWidth={0.7} strokeDasharray="3 3" />
      <polyline points={line} fill="none" stroke="var(--fg)" strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(last)} r={3} fill={outOfBand ? 'var(--critical)' : 'var(--fg)'} />
    </svg>
  );
}
