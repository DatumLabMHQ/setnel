import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getSignals, getSignalCounts, type SignalStatus } from '@/lib/signals';
import { getBrief } from '@/lib/brief';
import { getRuleManifest } from '@/lib/rules';
import { fmtTime } from '@/lib/format';
import { markSignalUsed, dismissSignal, reopenSignal } from './actions';
import { PageHeader } from '@/components/page-header';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

// Content: story angles the data platform surfaced, with a draft and the handles to tag.
// Rules: rules/*.yml run by scripts/rules/engine.mjs (hourly and daily, reads the platform's curated tables).
// Nothing here pages anyone; it is an editorial queue.

const TABS: { k: SignalStatus | 'all'; label: string }[] = [
  { k: 'new', label: 'New' }, { k: 'used', label: 'Used' }, { k: 'dismissed', label: 'Dismissed' }, { k: 'all', label: 'All' },
];

// Domain formatter: values can be arbitrary strings or figures; strings pass through untouched.
function fmtNumber(v: number | string | null): string {
  if (v == null) return 'n/a';
  if (typeof v === 'string') return v;
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function statusBadgeClass(status: string): string {
  if (status === 'used') return 'bg-(--good-soft) text-(--good) border-transparent';
  if (status === 'new') return 'bg-(--info-soft) text-(--info) border-transparent';
  return '';
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthed())) redirect('/login');
  const sp = await searchParams;
  const status = (TABS.some((t) => t.k === sp.status) ? sp.status : 'new') as SignalStatus | 'all';
  const days = sp.days ? Math.max(1, Math.min(90, Number(sp.days))) : 14;
  const [signals, counts, brief, rules] = await Promise.all([getSignals({ status, days }), getSignalCounts(days), getBrief(new Date().toISOString().slice(0, 10)), getRuleManifest()]);

  const liveRules = rules.filter((r) => r.status === 'live').length;
  const waitingRules = rules.filter((r) => r.status === 'waiting').length;

  const kpis = [
    { label: 'New angles', value: String(counts.newCount), sub: `last ${days} days` },
    { label: 'Used', value: String(counts.used), sub: 'published or scheduled', tone: 'text-(--good)' },
    { label: 'Dismissed', value: String(counts.dismissed), sub: 'not worth a post' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Content"
        question="What is worth posting today?"
        answer="Story angles the data platform surfaced, each with a draft you can paste and the figures behind it. Mark one used when it goes out, or dismiss it when it is not a story."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="gap-1 pb-0">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className={`font-mono text-2xl tabular-nums ${k.tone ?? ''}`}>{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="gap-1 pb-0">
            <CardDescription>Machine door</CardDescription>
            <CardTitle className="font-mono text-sm">
              <code className="rounded bg-muted px-1 py-0.5">/api/v1/signals</code>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1 text-xs text-muted-foreground">Same JSON, for the MCP server and agents</CardContent>
        </Card>
      </section>

      {brief ? (
        <Card>
          <CardHeader>
            <CardTitle>The day in three layers</CardTitle>
            <CardDescription>{brief.day} · written by {brief.model} from {brief.signal_ids.length} signals. Stop reading at any boundary.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {([['Layer 1', brief.layer1], ['Layer 2', brief.layer2], ['Layer 3', brief.layer3]] as const).map(([label, body]) => (
              <div key={label}>
                <div className="mb-1 text-sm font-medium">{label}</div>
                {body.split(/\n\s*\n/).map((para, i) => (
                  <p key={i} className="mb-2 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">{para}</p>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Content signals</CardTitle>
          <CardDescription>Each card is one angle the platform data supports today, with a headline, a draft, the handles to tag, and the figures behind it. The same fingerprint is never raised twice within seven days.</CardDescription>
          <CardAction>
            <div className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <Button
                  key={t.k}
                  size="sm"
                  variant={status === t.k ? 'default' : 'outline'}
                  render={<Link href={`/setnel/content?status=${t.k}&days=${days}`} />}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <Empty>
              <EmptyTitle>No {status === 'all' ? '' : status + ' '}signals in the last {days} days</EmptyTitle>
              <EmptyDescription>The content detector runs every morning at 07:10 UTC and can be run by hand from the setnel-content workflow.</EmptyDescription>
            </Empty>
          ) : (
            <div className="grid gap-3">
              {signals.map((s) => {
                const p = s.payload;
                const numbers = Object.entries(p.numbers ?? {});
                return (
                  <article key={s.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{p.product ?? s.dashboard_id}</Badge>
                          <Badge variant="outline">{p.rule ?? s.detector_id}</Badge>
                          <Badge variant={s.signal_status === 'dismissed' ? 'secondary' : undefined} className={statusBadgeClass(s.signal_status)}>{s.signal_status}</Badge>
                          <span className="text-xs text-muted-foreground">{fmtTime(s.fired_at)}{p.day ? ` · data day ${p.day}` : ''}</span>
                        </div>
                        <h3 className="text-sm font-medium">{s.message}</h3>
                        {p.angle ? <div className="mt-0.5 text-xs text-muted-foreground">{p.angle}</div> : null}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {s.signal_status !== 'used' ? (
                          <form action={markSignalUsed}><input type="hidden" name="id" value={s.id} /><Button type="submit" size="sm" variant="outline">Mark used</Button></form>
                        ) : null}
                        {s.signal_status !== 'dismissed' ? (
                          <form action={dismissSignal}><input type="hidden" name="id" value={s.id} /><Button type="submit" size="sm" variant="ghost">Dismiss</Button></form>
                        ) : null}
                        {s.signal_status !== 'new' ? (
                          <form action={reopenSignal}><input type="hidden" name="id" value={s.id} /><Button type="submit" size="sm" variant="ghost">Reopen</Button></form>
                        ) : null}
                      </div>
                    </div>
                    {p.draft ? (
                      <pre className="my-2 font-sans text-sm leading-relaxed whitespace-pre-wrap">{p.draft}</pre>
                    ) : null}
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {p.handles && p.handles.length > 0 ? <div>Tag: {p.handles.join(' ')}</div> : null}
                      {numbers.length > 0 ? <div>{numbers.map(([k, v]) => `${k} ${fmtNumber(v)}`).join(' · ')}</div> : null}
                      {p.source ? <div>Source: <code className="rounded bg-muted px-1 py-0.5">{p.source}</code></div> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>{liveRules} live · {waitingRules} waiting for data. Thresholds change by pull request in setnel/rules.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Cooldown</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>What fires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id} className={r.status === 'live' ? '' : 'opacity-60'}>
                  <TableCell className="align-top">
                    <code className="font-mono text-xs">{r.id}</code>
                    {r.severity !== 'info' ? <Badge variant="outline" className="ml-1.5">{r.severity}</Badge> : null}
                  </TableCell>
                  <TableCell className="align-top">{r.product}</TableCell>
                  <TableCell className="align-top">{r.owner}</TableCell>
                  <TableCell className="align-top">{r.schedule}</TableCell>
                  <TableCell className="align-top tabular-nums">{r.cooldown_hours}h</TableCell>
                  <TableCell className="align-top">
                    {r.status}
                    {r.last_ran_at ? <div className="text-[11px] text-muted-foreground">ran {fmtTime(r.last_ran_at)}</div> : null}
                  </TableCell>
                  <TableCell className="max-w-[520px] align-top whitespace-normal">
                    {r.description}
                    {r.needs ? <div className="text-xs text-muted-foreground">needs: {r.needs}</div> : null}
                    {Object.keys(r.params ?? {}).length ? (
                      <div className="text-[11px] text-muted-foreground">params {JSON.stringify(r.params)}{Object.keys(r.gates ?? {}).length ? ` · gates ${JSON.stringify(r.gates)}` : ''}</div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
