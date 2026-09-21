import { redirect, notFound } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getIncident, type MetricPoint } from '@/lib/queries';
import { getRunbook } from '@/lib/runbooks';
import { buildDeepLink } from '@/lib/ingest';
import { fmtTime, usd, count, NA } from '@/lib/format';
import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr';
import { PageHeader } from '@/components/page-header';
import { DetailLayout } from '@/components/detail-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { acknowledgeIncident, muteIncident, markFalsePositive, resolveIncident, addNote, muteDetector } from '../../actions';

export const dynamic = 'force-dynamic';

// Severity as a colour and a word, using the Setnel tokens.
const SEV_BADGE: Record<string, string> = {
  info: 'bg-(--info-soft) text-(--info)',
  warning: 'bg-(--warning-soft) text-(--warning)',
  critical: 'bg-(--critical-soft) text-(--critical)',
  emergency: 'bg-(--emergency-soft) text-(--emergency)',
};

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) redirect('/login');
  const { id } = await params;
  const detail = await getIncident(id);
  if (!detail) notFound();
  const { incident: i, events, notes, metric } = detail;
  const deepLink = buildDeepLink(i.base_url, i.link_path, String(i.id));
  const muted = i.muted_until && new Date(i.muted_until).getTime() > Date.now();
  const runbook = getRunbook(i.detector_id, events[0]?.category ?? '');

  const main = (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${SEV_BADGE[i.severity] ?? ''} border-transparent`}>{i.severity}</Badge>
            <Badge className={i.status === 'active' ? 'border-transparent bg-(--warning-soft) text-(--warning)' : 'border-transparent bg-(--good-soft) text-(--good)'}>{i.status}</Badge>
            {i.false_positive ? <Badge variant="outline">false positive</Badge> : null}
            {muted ? <Badge variant="secondary">muted</Badge> : null}
          </div>
          <CardTitle className="text-lg leading-snug">{i.message}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{i.detector_id}</span>
            <span aria-hidden>·</span>
            <span>opened {fmtTime(i.opened_at)}</span>
            <span aria-hidden>·</span>
            <span>{count(i.event_count)} events</span>
            {i.resolved_at ? <><span aria-hidden>·</span><span>resolved {fmtTime(i.resolved_at)}{i.resolved_by ? ` by ${i.resolved_by}` : ''}</span></> : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {!i.acknowledged_at && i.status === 'active' ? (
            <form action={acknowledgeIncident}><input type="hidden" name="id" value={i.id} /><Button type="submit" size="sm">Acknowledge</Button></form>
          ) : null}
          {i.status === 'active' ? (
            <>
              <form action={muteIncident}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="minutes" value="60" /><Button type="submit" size="sm" variant="outline">Mute 1h</Button></form>
              <form action={muteIncident}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="minutes" value="1440" /><Button type="submit" size="sm" variant="outline">Mute 24h</Button></form>
              <form action={resolveIncident}><input type="hidden" name="id" value={i.id} /><Button type="submit" size="sm" variant="outline">Resolve</Button></form>
              <form action={markFalsePositive}><input type="hidden" name="id" value={i.id} /><Button type="submit" size="sm" variant="destructive">False positive</Button></form>
            </>
          ) : null}
          <form action={muteDetector}>
            <input type="hidden" name="id" value={i.id} />
            <input type="hidden" name="dashboardId" value={i.dashboard_id} />
            <input type="hidden" name="detectorId" value={i.detector_id} />
            <input type="hidden" name="minutes" value="1440" />
            <Button type="submit" size="sm" variant="outline" title={`Silence all ${i.detector_id} alerts for 24h`}>Mute detector 24h</Button>
          </form>
          <Button render={<a href={deepLink} target="_blank" rel="noreferrer" />} size="sm" variant="outline">
            Open dashboard <ArrowUpRightIcon />
          </Button>
        </CardContent>
      </Card>

      {runbook ? (
        <Card>
          <CardHeader>
            <CardTitle>Runbook: {runbook.title}</CardTitle>
            <CardDescription>{runbook.when}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm marker:text-muted-foreground">
              {runbook.steps.map((s, n) => <li key={n} className="pl-1">{s}</li>)}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {metric && metric.points.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base">{metric.key}</CardTitle>
            <CardDescription>The metric behind this incident, last {count(metric.points.length)} samples.</CardDescription>
          </CardHeader>
          <CardContent>
            <Spark points={metric.points} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Notes and events for this incident, newest context first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={addNote} className="flex items-center gap-2">
            <input type="hidden" name="id" value={i.id} />
            <Input name="body" placeholder="Add a note" maxLength={1000} className="flex-1" />
            <Button type="submit" size="sm">Add note</Button>
          </form>
          <ul className="flex flex-col gap-3 text-sm">
            {notes.map((n) => (
              <li key={`n${n.id}`} className="flex flex-col gap-0.5 border-l-2 border-(--info) pl-3">
                <span className="font-mono text-xs text-muted-foreground">{fmtTime(n.created_at)}</span>
                <span><span className="font-medium">{n.author}</span>: {n.body}</span>
              </li>
            ))}
            {events.map((e) => (
              <li key={`e${e.id}`} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <span className="font-mono text-xs text-muted-foreground">{fmtTime(e.fired_at)}</span>
                <span className="text-muted-foreground">{e.message}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );

  const aside = (
    <Card>
      <CardHeader>
        <CardTitle>{i.dashboard_name}</CardTitle>
        <CardDescription>The facts on this incident at a glance.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col text-sm">
          <Fact label="Severity"><Badge className={`${SEV_BADGE[i.severity] ?? ''} border-transparent`}>{i.severity}</Badge></Fact>
          <Separator />
          <Fact label="Status"><span className={i.status === 'active' ? 'text-(--warning)' : 'text-(--good)'}>{i.status}</span></Fact>
          <Separator />
          <Fact label="Detector"><span className="font-mono text-xs">{i.detector_id}</span></Fact>
          <Separator />
          <Fact label="Opened">{fmtTime(i.opened_at)}</Fact>
          <Separator />
          <Fact label="Events"><span className="font-mono tabular-nums">{count(i.event_count)}</span></Fact>
          <Separator />
          <Fact label="Exposure at risk"><span className="font-mono tabular-nums">{i.exposure_usd ? usd(i.exposure_usd) : NA}</span></Fact>
          {i.acknowledged_at ? <><Separator /><Fact label="Acknowledged">by {i.acknowledged_by ?? NA}</Fact></> : null}
          {i.resolved_at ? <><Separator /><Fact label="Resolved">{fmtTime(i.resolved_at)}{i.resolved_by ? ` by ${i.resolved_by}` : ''}</Fact></> : null}
          {muted ? <><Separator /><Fact label="Muted"><span className="text-(--warning)">muted</span></Fact></> : null}
        </dl>
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader
        eyebrow="Incident"
        question="What happened here?"
        answer={`${i.dashboard_name} on ${i.detector_id}, opened ${fmtTime(i.opened_at)}. Work the runbook, then act from the queue on the left.`}
      />
      <DetailLayout main={main} aside={aside} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Spark({ points }: { points: MetricPoint[] }) {
  const W = 900, H = 160, pad = 24;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const n = points.length;
  const x = (idx: number) => pad + (idx / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / range) * (H - 2 * pad);
  const line = points.map((p, idx) => `${x(idx)},${y(p.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full text-foreground" role="img" aria-label="metric">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(points[n - 1].value)} r={3} fill="currentColor" />
    </svg>
  );
}
