import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getAuditLog } from '@/lib/admin';
import { fmtTime, count, NA } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { TrayIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

// Human-readable labels + a category class for each audit action.
const ACTIONS: Record<string, { label: string; kind: 'incident' | 'detector' | 'config' | 'dashboard' }> = {
  'incident.ack': { label: 'acknowledged incident', kind: 'incident' },
  'incident.mute': { label: 'muted incident', kind: 'incident' },
  'incident.false_positive': { label: 'marked false positive', kind: 'incident' },
  'incident.resolve': { label: 'resolved incident', kind: 'incident' },
  'detector.mute': { label: 'muted detector', kind: 'detector' },
  'detector.enable': { label: 'enabled detector', kind: 'detector' },
  'detector.disable': { label: 'disabled detector', kind: 'detector' },
  'detector.severity': { label: 'set detector severity', kind: 'detector' },
  'baseline.tune': { label: 'tuned baseline', kind: 'config' },
  'escalation.save': { label: 'updated escalation policy', kind: 'config' },
  'dashboard.add': { label: 'onboarded dashboard', kind: 'dashboard' },
  'dashboard.enable': { label: 'enabled dashboard', kind: 'dashboard' },
  'dashboard.disable': { label: 'paused dashboard', kind: 'dashboard' },
};

// Category as a colour and a word, using the Setnel tokens.
const KIND_BADGE: Record<string, string> = {
  incident: 'bg-(--info-soft) text-(--info)',
  detector: 'bg-(--warning-soft) text-(--warning)',
  config: 'bg-muted text-muted-foreground',
  dashboard: 'bg-(--good-soft) text-(--good)',
};

// If the audit target is an incident id (integer), link to its page.
function targetHref(action: string, target: string | null): string | null {
  if (!target) return null;
  if (action.startsWith('incident.') && /^\d+$/.test(target)) return `/setnel/incident/${target}`;
  return null;
}

const KINDS = [
  { k: 'all', label: 'All' },
  { k: 'incident', label: 'Incidents' },
  { k: 'config', label: 'Config' },
  { k: 'detector', label: 'Detectors' },
  { k: 'dashboard', label: 'Dashboards' },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthed())) redirect('/login');
  const sp = await searchParams;
  const kind = sp.kind && KINDS.some((x) => x.k === sp.kind) ? sp.kind : 'all';
  const all = await getAuditLog(300);
  const log = kind === 'all' ? all : all.filter((l) => (ACTIONS[l.action]?.kind ?? 'config') === kind);
  const actors = new Set(log.map((l) => l.actor)).size;

  const kpis = [
    { label: 'Entries', value: count(log.length), sub: 'most recent 300', mono: true },
    { label: 'Operators', value: count(actors), sub: 'distinct actors', mono: true },
    { label: 'Latest', value: log[0] ? fmtTime(log[0].created_at) : NA, sub: 'last change', mono: false },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        question="Who changed what?"
        answer="Every console action, and the operator behind it. Filter by area, then follow a target back to its incident."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="gap-1 pb-0">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className={k.mono ? 'font-mono text-2xl tabular-nums' : 'text-lg leading-snug'}>{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Every console action, newest first. Ack, mute, resolve and config changes all land here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-2">
            {KINDS.map((x) => (
              <a
                key={x.k}
                href={x.k === 'all' ? '/setnel/inbox' : `/setnel/inbox?kind=${x.k}`}
                className={
                  kind === x.k
                    ? 'rounded-full border border-transparent bg-foreground px-2.5 py-0.5 text-xs font-medium text-background'
                    : 'rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                }
              >
                {x.label}
              </a>
            ))}
          </nav>

          {log.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><TrayIcon /></EmptyMedia>
                <EmptyTitle>No activity yet</EmptyTitle>
                <EmptyDescription>Console actions such as ack, mute, resolve and config changes will show up here as they happen.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">When</TableHead>
                    <TableHead className="w-32">Area</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((l) => {
                    const a = ACTIONS[l.action] ?? { label: l.action, kind: 'config' as const };
                    const href = targetHref(l.action, l.target);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{fmtTime(l.created_at)}</TableCell>
                        <TableCell><Badge className={`${KIND_BADGE[a.kind] ?? 'bg-muted text-muted-foreground'} border-transparent`}>{a.kind}</Badge></TableCell>
                        <TableCell className="font-medium">{l.actor}</TableCell>
                        <TableCell className="whitespace-normal">
                          {a.label}
                          {l.detail ? <span className="text-muted-foreground"> · {l.detail}</span> : null}
                        </TableCell>
                        <TableCell>
                          {l.target
                            ? href
                              ? <a className="text-foreground hover:underline" href={href}>{l.target}</a>
                              : <code className="font-mono text-xs">{l.target}</code>
                            : <span className="text-muted-foreground">{NA}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
