import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getIncidents, getSummary, getSla, type Filters } from '@/lib/queries';
import { getSloTargets } from '@/lib/admin';
import { usd, count, NA } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IncidentCard } from '../incident-card';
import { IncidentTriage, type TriageIncident } from './triage';

export const dynamic = 'force-dynamic';

type Tone = 'good' | 'warn' | 'bad' | undefined;
const toneClass: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-(--good)',
  warn: 'text-(--warning)',
  bad: 'text-(--critical)',
};

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await isAuthed())) redirect('/login');
  const sp = await searchParams;
  const filters: Filters = {
    status: (sp.status as Filters['status']) ?? 'active',
    dashboardId: sp.dashboard || undefined,
    category: sp.category || undefined,
    severity: sp.severity || undefined,
    sinceHours: sp.since ? Number(sp.since) : undefined,
  };

  const [incidents, summary, sla, slo] = await Promise.all([getIncidents(filters), getSummary(), getSla(30), getSloTargets()]);
  const active = incidents.filter((i) => i.status === 'active');
  const resolved = incidents.filter((i) => i.status === 'resolved');
  const now = Date.now();
  const triage: TriageIncident[] = active.map((i) => ({
    id: String(i.id), dashboardName: i.dashboard_name, severity: i.severity, message: i.message,
    detectorId: i.detector_id, acked: Boolean(i.acknowledged_at), ackedBy: i.acknowledged_by,
    muted: Boolean(i.muted_until && new Date(i.muted_until).getTime() > now), exposureUsd: i.exposure_usd,
    openedAt: i.opened_at, eventCount: i.event_count,
  }));

  const unacked = active.filter((i) => !i.acknowledged_at).length;
  const exposure = active.reduce((a, i) => a + (i.exposure_usd ?? 0), 0);

  const kpis = [
    { label: 'Active', value: count(summary.activeCount), sub: `${count(unacked)} unacked`, tone: (summary.activeCount ? 'warn' : 'good') as Tone },
    { label: 'Critical', value: count(summary.criticalActive), sub: 'need attention', tone: (summary.criticalActive ? 'bad' : 'good') as Tone },
    { label: 'Opened 24h', value: count(summary.last24h), sub: 'new incidents', tone: undefined as Tone },
    { label: 'Ack rate', value: `${sla.ackRatePct}%`, sub: `target ≥ ${slo.ackRateTarget}% · mtta ${sla.avgTimeToAckMin == null ? NA : sla.avgTimeToAckMin + 'm'}`, tone: (sla.ackRatePct >= slo.ackRateTarget ? 'good' : 'bad') as Tone },
    { label: 'Exposure at risk', value: exposure > 0 ? usd(exposure) : NA, sub: 'across active incidents', tone: undefined as Tone },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Incidents"
        question="What needs attention?"
        answer={`${summary.activeCount} active, ${summary.last24h} opened in the last 24h. Triage the queue below, then dig into any incident for its runbook and timeline.`}
      />

      {/* KPI strip: the at-a-glance state of the queue. */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="gap-1 pb-0">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className={`font-mono text-2xl tabular-nums ${k.tone ? toneClass[k.tone] : ''}`}>{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
          </Card>
        ))}
      </section>

      {/* Triage queue: filters then the keyboard-driven list. */}
      <Card>
        <CardHeader>
          <CardTitle>Triage queue</CardTitle>
          <CardDescription>Active incidents, filter to narrow the view. Select rows to ack, mute, or resolve in bulk.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-2">
            <FilterLink sp={sp} k="status" v="active" label="Active" />
            <FilterLink sp={sp} k="status" v="all" label="All" />
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <FilterLink sp={sp} k="severity" v="warning" label="Warning" />
            <FilterLink sp={sp} k="severity" v="critical" label="Critical" />
            <FilterLink sp={sp} k="severity" v="emergency" label="Emergency" />
            {summary.dashboards.length ? <span className="mx-1 h-4 w-px bg-border" aria-hidden /> : null}
            {summary.dashboards.map((d) => (
              <FilterLink key={d.id} sp={sp} k="dashboard" v={d.id} label={d.name} />
            ))}
          </nav>

          <IncidentTriage incidents={triage} />
        </CardContent>
      </Card>

      {resolved.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Resolved</CardTitle>
            <CardDescription>{count(resolved.length)} incidents closed in this view. Expand to review what was handled.</CardDescription>
          </CardHeader>
          <CardContent>
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-foreground select-none">Show resolved ({count(resolved.length)})</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {resolved.map((i) => <IncidentCard key={i.id} i={i} />)}
              </ul>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function FilterLink({ sp, k, v, label }: { sp: Record<string, string | undefined>; k: string; v: string; label: string }) {
  const active = sp[k] === v;
  const next = new URLSearchParams(Object.entries(sp).filter(([, val]) => val) as [string, string][]);
  if (active) next.delete(k);
  else next.set(k, v);
  const qs = next.toString();
  return (
    <a
      href={`/setnel/incidents${qs ? `?${qs}` : ''}`}
      className={
        active
          ? 'rounded-full border border-transparent bg-foreground px-2.5 py-0.5 text-xs font-medium text-background'
          : 'rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
      }
    >
      {label}
    </a>
  );
}
