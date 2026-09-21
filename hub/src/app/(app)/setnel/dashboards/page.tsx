import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getDashboardsOverview } from '@/lib/admin';
import { HEALTH_EXPECTED_PER_DAY } from '@/lib/queries';
import { count, pct, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

// Collection-intensity ramp for the 14-day strip: none, low, partial, full.
const CELL = [
  'var(--muted)',
  'color-mix(in oklab, var(--good) 30%, transparent)',
  'color-mix(in oklab, var(--good) 60%, transparent)',
  'var(--good)',
];
const cellLevel = (checks: number) => (checks <= 0 ? 0 : checks < 60 ? 1 : checks < 200 ? 2 : 3);

const STATUS: Record<'healthy' | 'stale' | 'down', string> = {
  healthy: 'bg-(--good)',
  stale: 'bg-(--warning)',
  down: 'bg-(--critical)',
};

function uptimePct(cells: { checks: number }[]): number {
  if (!cells.length) return 0;
  const days = cells.filter((c) => c.checks > 0).length;
  return Math.round((days / cells.length) * 100);
}

export default async function DashboardsPage() {
  if (!(await isAuthed())) redirect('/login');
  const rows = await getDashboardsOverview();

  const totals = rows.reduce(
    (a, r) => ({
      metrics: a.metrics + r.metricCount, detectors: a.detectors + r.detectorCount,
      active: a.active + r.activeIncidents, today: a.today + r.checksToday,
    }),
    { metrics: 0, detectors: 0, active: 0, today: 0 },
  );
  const healthy = rows.filter((r) => r.status === 'healthy').length;

  const kpis = [
    { label: 'Dashboards', value: String(rows.length), sub: `${healthy} healthy` },
    { label: 'Metrics tracked', value: String(totals.metrics), sub: 'across all surfaces' },
    { label: 'Detectors', value: String(totals.detectors), sub: 'watching' },
    { label: 'Active incidents', value: String(totals.active), sub: 'open now', tone: totals.active ? 'text-(--warning)' : 'text-(--good)' },
    { label: 'Check-ins today', value: count(totals.today), sub: `~${HEALTH_EXPECTED_PER_DAY}/day target each` },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Dashboards"
        question="Which surfaces are collecting and clear?"
        answer="Every monitored dashboard, its 14-day collection record, uptime, and open incidents. Click a row to drill into one surface."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="gap-1 pb-0">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className={`font-mono text-2xl tabular-nums ${k.tone ?? ''}`}>{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
          </Card>
        ))}
      </section>

      <Card>
          <CardHeader>
            <CardTitle>Monitored dashboards</CardTitle>
            <CardDescription>{rows.length} surfaces, newest check first. Green marks a day with data, grey a gap.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Dashboard</TableHead>
                    <TableHead>14-day collection</TableHead>
                    <TableHead className="text-right">Uptime</TableHead>
                    <TableHead className="text-right">Last check</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">Metrics</TableHead>
                    <TableHead className="text-right">Detectors</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">30d</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((h) => {
                    const up = uptimePct(h.cells);
                    return (
                      <TableRow key={h.id}>
                        <TableCell>
                          <Link href={`/setnel/dashboards/${h.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                            <span className={`size-2 shrink-0 rounded-full ${STATUS[h.status]}`} />
                            {h.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-0.5">
                            {h.cells.map((c) => (
                              <span key={c.day} title={`${c.day}: ${c.checks}`} className="h-4 w-1.5 rounded-[2px]" style={{ backgroundColor: CELL[cellLevel(c.checks)] }} />
                            ))}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-mono tabular-nums ${up >= 90 ? 'text-(--good)' : up < 50 ? 'text-(--critical)' : ''}`}>{pct(up, 0)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{timeAgo(h.lastCheckAt)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{count(h.checksToday)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{count(h.metricCount)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{count(h.detectorCount)}</TableCell>
                        <TableCell className="text-right">
                          {h.activeIncidents > 0 ? (
                            <Badge className={h.criticalActive ? 'bg-(--critical-soft) text-(--critical) border-transparent' : 'bg-(--warning-soft) text-(--warning) border-transparent'}>{h.activeIncidents}</Badge>
                          ) : (
                            <span className="font-mono tabular-nums text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{count(h.incidents30d)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-4 px-4 pt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-[2px]" style={{ backgroundColor: CELL[3] }} /> full</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-[2px]" style={{ backgroundColor: CELL[2] }} /> partial</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-[2px]" style={{ backgroundColor: CELL[1] }} /> low</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-[2px]" style={{ backgroundColor: CELL[0] }} /> none</span>
            </div>
          </CardContent>
        </Card>
    </>
  );
}
