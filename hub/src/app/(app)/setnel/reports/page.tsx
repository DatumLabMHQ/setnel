import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getSla, getDetectorStats } from '@/lib/queries';
import { getWeeklyReport, getSloTargets } from '@/lib/admin';
import { WeeklyTrends } from './report-charts';
import { PageHeader } from '@/components/page-header';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { DownloadSimpleIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

const toneClass: Record<'good' | 'bad', string> = { good: 'text-(--good)', bad: 'text-(--critical)' };

export default async function ReportsPage() {
  if (!(await isAuthed())) redirect('/login');
  const [sla, detectors, weeks, slo] = await Promise.all([getSla(30), getDetectorStats(30), getWeeklyReport(12), getSloTargets()]);

  // Tone each metric against its SLO target (lower-is-better for time/FP).
  const ackTone = sla.ackRatePct >= slo.ackRateTarget ? 'good' : 'bad';
  const ttaTone = sla.avgTimeToAckMin == null ? '' : sla.avgTimeToAckMin <= slo.mttaTargetMin ? 'good' : 'bad';
  const ttrTone = sla.avgTimeToResolveMin == null ? '' : sla.avgTimeToResolveMin <= slo.mttrTargetMin ? 'good' : 'bad';
  const fpTone = sla.falsePositivePct <= slo.fpRateTarget ? 'good' : 'bad';

  const kpis = [
    { label: 'Ack rate', value: `${sla.ackRatePct}%`, sub: `target at least ${slo.ackRateTarget}%`, tone: ackTone as 'good' | 'bad' },
    { label: 'Time to ack', value: sla.avgTimeToAckMin == null ? 'n/a' : `${sla.avgTimeToAckMin}m`, sub: `target at most ${slo.mttaTargetMin}m`, tone: ttaTone },
    { label: 'Time to resolve', value: sla.avgTimeToResolveMin == null ? 'n/a' : `${sla.avgTimeToResolveMin}m`, sub: `target at most ${slo.mttrTargetMin}m`, tone: ttrTone },
    { label: 'False positives', value: `${sla.falsePositivePct}%`, sub: `ceiling ${slo.fpRateTarget}% · ${sla.total} incidents`, tone: fpTone as 'good' | 'bad' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        question="How is the team doing over time?"
        answer="Response quality against the SLO targets, the last twelve weeks of trends, and which detectors are pulling their weight. Green means on target, red means off it."
      />

      {/* Response against targets, last 30 days. */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="gap-1 pb-0">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className={`font-mono text-2xl tabular-nums ${k.tone ? toneClass[k.tone as 'good' | 'bad'] : ''}`}>{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
          </Card>
        ))}
      </section>

      {/* Weekly trends. */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly trends</CardTitle>
          <CardDescription>Incidents, response times and false positives by week, oldest to newest.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" render={<a href="/api/v1/report" download />}>
              <DownloadSimpleIcon />
              Export CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {weeks.length === 0 ? (
            <Empty>
              <EmptyTitle>Not enough history yet</EmptyTitle>
              <EmptyDescription>Trends need at least a week of incidents before there is anything to plot.</EmptyDescription>
            </Empty>
          ) : (
            <>
              <WeeklyTrends weeks={weeks} />
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week of</TableHead>
                      <TableHead className="text-right">Incidents</TableHead>
                      <TableHead className="text-right">False pos.</TableHead>
                      <TableHead className="text-right">Acked %</TableHead>
                      <TableHead className="text-right">Time to ack</TableHead>
                      <TableHead className="text-right">Time to resolve</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...weeks].reverse().map((w) => (
                      <TableRow key={w.week}>
                        <TableCell className="font-medium">{w.week}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{w.incidents}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{w.falsePositives}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{w.ackedPct}%</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{w.mttaMin == null ? 'n/a' : `${w.mttaMin}m`}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{w.mttrMin == null ? 'n/a' : `${w.mttrMin}m`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detector quality, last 30 days. */}
      <Card>
        <CardHeader>
          <CardTitle>Detector quality</CardTitle>
          <CardDescription>Most active detectors over the last 30 days. A high false positive share means the detector needs tuning.</CardDescription>
        </CardHeader>
        <CardContent>
          {detectors.length === 0 ? (
            <Empty>
              <EmptyTitle>No incidents in the window</EmptyTitle>
              <EmptyDescription>Nothing has fired in the last 30 days, so there is no detector activity to rank.</EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detector</TableHead>
                  <TableHead>Dashboard</TableHead>
                  <TableHead className="text-right">Incidents</TableHead>
                  <TableHead className="text-right">False positives</TableHead>
                  <TableHead className="text-right">Avg ack</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detectors.map((d) => {
                  const fpPct = d.total ? Math.round((d.falsePositives / d.total) * 100) : 0;
                  return (
                    <TableRow key={`${d.dashboardId}.${d.detectorId}`}>
                      <TableCell className="font-mono text-xs">{d.detectorId}</TableCell>
                      <TableCell className="text-muted-foreground">{d.dashboardId}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{d.total}</TableCell>
                      <TableCell className={`text-right font-mono tabular-nums ${fpPct > 30 ? 'text-(--critical)' : ''}`}>
                        {d.falsePositives}{d.falsePositives ? ` (${fpPct}%)` : ''}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{d.avgAckMin == null ? 'n/a' : `${d.avgAckMin}m`}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

