import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getSummary, getHealthMatrix, getChartBundle, getSla } from '@/lib/queries';
import { getSloTargets } from '@/lib/admin';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendChart } from './trend-chart';

export const dynamic = 'force-dynamic';

type Tone = 'good' | 'warn' | 'bad' | undefined;
const toneClass: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-(--good)',
  warn: 'text-(--warning)',
  bad: 'text-(--critical)',
};

export default async function SetnelConsole() {
  if (!(await isAuthed())) redirect('/login');

  const [summary, health, bundle, sla, slo] = await Promise.all([
    getSummary(),
    getHealthMatrix(),
    getChartBundle(30),
    getSla(30),
    getSloTargets(),
  ]);

  const healthy = health.filter((h) => h.status === 'healthy').length;
  const collectingToday = health.filter((h) => h.checksToday > 0).length;

  const ttaBad = sla.avgTimeToAckMin != null && sla.avgTimeToAckMin > slo.mttaTargetMin;
  const ttrBad = sla.avgTimeToResolveMin != null && sla.avgTimeToResolveMin > slo.mttrTargetMin;

  const kpis = [
    { label: 'Dashboards', value: String(health.length), sub: 'monitored', href: '/setnel/dashboards' as const },
    { label: 'Collecting today', value: `${collectingToday}/${health.length}`, sub: 'checked in', href: '/setnel/dashboards' as const, tone: (collectingToday === health.length ? 'good' : collectingToday === 0 ? 'bad' : 'warn') as Tone },
    { label: 'Healthy', value: `${healthy}/${health.length}`, sub: 'under 24h since last check', href: '/setnel/dashboards' as const, tone: (healthy === health.length ? 'good' : 'warn') as Tone },
    { label: 'Active incidents', value: String(summary.activeCount), sub: 'open now', href: '/setnel/incidents' as const, tone: (summary.activeCount === 0 ? 'good' : 'warn') as Tone },
    summary.failedNotifications > 0
      ? { label: 'Delivery failures', value: String(summary.failedNotifications), sub: 'undelivered alerts', href: '/setnel/settings' as const, tone: 'bad' as Tone }
      : { label: 'Critical', value: String(summary.criticalActive), sub: 'active', href: '/setnel/incidents?severity=critical' as const, tone: (summary.criticalActive === 0 ? 'good' : 'bad') as Tone },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Console"
        question="Is anything wrong right now?"
        answer="The fleet at a glance: what is collecting, what is healthy, what is open, and how fast the team is responding. Detail lives in Dashboards and Incidents."
      />

      {/* KPI strip — the at-a-glance. */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="transition-colors hover:bg-accent/40">
            <Link href={k.href} className="block">
              <CardHeader className="gap-1 pb-0">
                <CardDescription>{k.label}</CardDescription>
                <CardTitle className={`font-mono text-2xl tabular-nums ${k.tone ? toneClass[k.tone] : ''}`}>{k.value}</CardTitle>
              </CardHeader>
              <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
            </Link>
          </Card>
        ))}
      </section>

      {/* Response against targets, last 30 days. */}
      <Card>
        <CardHeader>
          <CardTitle>Response, last 30 days</CardTitle>
          <CardDescription>How the team is doing against its SLO targets across {sla.total} incidents. Read reports for the full breakdown.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={`${sla.ackRatePct}%`} label="acknowledged" bad={sla.ackRatePct < slo.ackRateTarget} />
          <Stat value={sla.avgTimeToAckMin == null ? 'n/a' : `${sla.avgTimeToAckMin}m`} label="avg time to ack" bad={ttaBad} />
          <Stat value={sla.avgTimeToResolveMin == null ? 'n/a' : `${sla.avgTimeToResolveMin}m`} label="avg time to resolve" bad={ttrBad} />
          <Stat value={`${sla.falsePositivePct}%`} label="false positives" bad={sla.falsePositivePct > slo.fpRateTarget} />
        </CardContent>
      </Card>

      {/* Trend — the one rich visual that belongs on the overview. */}
      <Card>
        <CardHeader>
          <CardTitle>Trends</CardTitle>
          <CardDescription>Last 30 days. Switch the breakdown; click a legend entry to toggle a line.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart bundle={bundle} />
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ value, label, bad }: { value: string; label: string; bad?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`font-mono text-xl tabular-nums ${bad ? 'text-(--critical)' : ''}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
