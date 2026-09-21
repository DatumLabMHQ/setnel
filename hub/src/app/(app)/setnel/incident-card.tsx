import { acknowledgeIncident, muteIncident, markFalsePositive } from './actions';
import type { IncidentWithDashboard } from '@/lib/queries';
import { ArrowRightIcon } from '@phosphor-icons/react/ssr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usd, count } from '@/lib/format';

// Severity as a colour and a word, using the Setnel tokens.
export const SEV_BADGE: Record<string, string> = {
  info: 'bg-(--info-soft) text-(--info)',
  warning: 'bg-(--warning-soft) text-(--warning)',
  critical: 'bg-(--critical-soft) text-(--critical)',
  emergency: 'bg-(--emergency-soft) text-(--emergency)',
};

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function IncidentCard({ i }: { i: IncidentWithDashboard }) {
  const muted = i.muted_until && new Date(i.muted_until).getTime() > Date.now();
  return (
    <li className="list-none rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{i.dashboard_name}</span>
            <Badge className={`${SEV_BADGE[i.severity] ?? ''} border-transparent`}>{i.severity}</Badge>
            {i.status === 'resolved' ? <Badge className="border-transparent bg-(--good-soft) text-(--good)">resolved</Badge> : null}
            {i.acknowledged_at ? <Badge variant="secondary">ack {i.acknowledged_by}</Badge> : null}
            {muted ? <Badge variant="secondary">muted</Badge> : null}
            {i.false_positive ? <Badge variant="outline">false positive</Badge> : null}
            {i.event_count > 1 ? <Badge variant="secondary" className="font-mono tabular-nums">×{count(i.event_count)}</Badge> : null}
            {i.exposure_usd ? <Badge className="border-transparent bg-(--warning-soft) font-mono tabular-nums text-(--warning)">{usd(i.exposure_usd)} at risk</Badge> : null}
          </div>
          <a className="text-sm text-foreground hover:underline" href={`/setnel/incident/${i.id}`}>{i.message}</a>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{i.detector_id}</span>
            <span aria-hidden>·</span>
            <span>{timeAgo(i.last_event_at)}</span>
            <span aria-hidden>·</span>
            <a href={`/setnel/incident/${i.id}`} className="inline-flex items-center gap-1 text-foreground hover:underline">
              details <ArrowRightIcon className="size-3" />
            </a>
          </div>
        </div>
        {i.status === 'active' ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!i.acknowledged_at ? (
              <form action={acknowledgeIncident}>
                <input type="hidden" name="id" value={i.id} />
                <Button type="submit" size="sm">Ack</Button>
              </form>
            ) : null}
            <form action={muteIncident}>
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="minutes" value="60" />
              <Button type="submit" size="sm" variant="outline">Mute</Button>
            </form>
            <form action={markFalsePositive}>
              <input type="hidden" name="id" value={i.id} />
              <Button type="submit" size="sm" variant="destructive">False positive</Button>
            </form>
          </div>
        ) : null}
      </div>
    </li>
  );
}
