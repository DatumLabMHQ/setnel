import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getSummary, getIncidents } from '@/lib/queries';
import { fmtUsd } from '@/lib/format';
import { LiveRefresh } from '../(app)/setnel/live';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircleIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

const levelClass: Record<'crit' | 'warn' | 'ok', string> = {
  crit: 'text-(--critical)',
  warn: 'text-(--warning)',
  ok: 'text-(--good)',
};
const levelWord: Record<'crit' | 'warn' | 'ok', string> = {
  crit: 'Critical',
  warn: 'Active incidents',
  ok: 'All clear',
};
const sevClass: Record<string, string> = {
  info: 'bg-(--info-soft) text-(--info) border-transparent',
  warning: 'bg-(--warning-soft) text-(--warning) border-transparent',
  critical: 'bg-(--critical-soft) text-(--critical) border-transparent',
  emergency: 'bg-(--emergency-soft) text-(--emergency) border-transparent',
};

export default async function Wallboard() {
  if (!(await isAuthed())) redirect('/login');
  const [summary, active] = await Promise.all([getSummary(), getIncidents({ status: 'active' })]);
  const crit = active.filter((i) => i.severity === 'critical' || i.severity === 'emergency');
  const level: 'crit' | 'warn' | 'ok' = summary.criticalActive > 0 ? 'crit' : summary.activeCount > 0 ? 'warn' : 'ok';

  const kpis = [
    { value: summary.criticalActive, label: 'critical', tone: summary.criticalActive > 0 ? 'text-(--critical)' : '' },
    { value: summary.activeCount, label: 'active', tone: summary.activeCount > 0 ? 'text-(--warning)' : '' },
    { value: summary.last24h, label: 'opened 24h', tone: '' },
    { value: summary.failedNotifications, label: 'delivery failures', tone: summary.failedNotifications > 0 ? 'text-(--critical)' : '' },
  ];

  return (
    <div className="flex min-h-screen flex-col gap-8 bg-background p-6 text-foreground md:p-10">
      <header className="flex items-center gap-4 border-b border-border pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" width={40} height={40} alt="" className="rounded-lg" />
        <span className="font-heading text-2xl font-semibold tracking-tight">Setnel</span>
        <span className={`text-2xl font-semibold tracking-tight ${levelClass[level]}`}>{levelWord[level]}</span>
        <div className="ml-auto"><LiveRefresh intervalMs={20000} /></div>
      </header>

      <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="items-center py-8 text-center">
            <CardContent className="flex flex-col items-center gap-2">
              <span className={`font-mono text-6xl font-semibold tabular-nums lg:text-7xl ${k.tone}`}>{k.value}</span>
              <span className="text-base text-muted-foreground">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-1 flex-col gap-4">
        {crit.length === 0 ? (
          <Card className="flex-1">
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <CheckCircleIcon className="size-16 text-(--good)" />
              <span className="text-3xl font-medium text-(--good)">No critical incidents</span>
            </CardContent>
          </Card>
        ) : (
          crit.map((i) => (
            <Card key={i.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-2">
                <Badge className={`${sevClass[i.severity] ?? 'bg-muted text-muted-foreground border-transparent'} text-sm`}>{i.severity}</Badge>
                <span className="text-xl font-semibold">{i.dashboard_name}</span>
                <span className="flex-1 text-lg text-muted-foreground">{i.message}</span>
                {i.exposure_usd ? <span className="font-mono text-xl font-semibold tabular-nums text-(--critical)">{fmtUsd(i.exposure_usd)}</span> : null}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
