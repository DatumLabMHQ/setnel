import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getFeed, getFeedCounts, TOPICS, type FeedFilter, type NewsItem, type Correlation } from '@/lib/news';
import { timeAgo } from '@/lib/format';
import { dismissNewsItem, markNewsSignalUsed } from './actions';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { ArrowSquareOutIcon, LightningIcon, ChartLineUpIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

const FILTERS: { k: FeedFilter; label: string }[] = [
  { k: 'all', label: 'Everything' },
  { k: 'relevant', label: 'With an angle' },
  { k: 'respond', label: 'Respond now' },
];

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ filter?: string; topic?: string; days?: string }> }) {
  if (!(await isAuthed())) redirect('/login');
  const sp = await searchParams;
  const filter = (FILTERS.some((f) => f.k === sp.filter) ? sp.filter : 'all') as FeedFilter;
  const topic = TOPICS.some((t) => t.id === sp.topic) ? sp.topic! : '';
  const days = Math.max(1, Math.min(30, Number(sp.days ?? 7) || 7));
  const [items, counts] = await Promise.all([getFeed({ filter, topic, days }), getFeedCounts(days)]);
  const href = (f: FeedFilter, t: string) => `/setnel/feed?filter=${f}${t ? `&topic=${t}` : ''}&days=${days}`;

  return (
    <>
      <PageHeader
        eyebrow="Feed"
        question="What is the market saying, and what do we have to add?"
        answer={`Announcements and coverage across the protocols we watch, each read against our own metrics and incidents. ${counts.respond} of the last ${days} days' ${counts.items} items are worth responding to now; ${counts.promoted} became content signals.`}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Items" value={counts.items} sub={`last ${days} days`} />
        <Kpi label="With an angle" value={counts.relevant} sub="our data adds something" tone={counts.relevant ? 'good' : undefined} />
        <Kpi label="Respond now" value={counts.respond} sub="timely, we have the numbers" tone={counts.respond ? 'warn' : undefined} />
        <Kpi label="Content signals" value={counts.promoted} sub={counts.pending ? `${counts.pending} still to correlate` : 'from this feed'} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Stream</CardTitle>
          <CardDescription>Newest and most actionable first. Open an item to read it; the angle underneath is ours and uses only figures from our data.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} render={<Link href={href(f.k, topic)} />}>{f.label}</Button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Button size="sm" variant={topic === '' ? 'secondary' : 'ghost'} render={<Link href={href(filter, '')} />}>All topics</Button>
            {TOPICS.map((t) => (
              <Button key={t.id} size="sm" variant={topic === t.id ? 'secondary' : 'ghost'} render={<Link href={href(filter, t.id)} />}>{t.label}</Button>
            ))}
          </div>

          {items.length === 0 ? (
            <Empty>
              <EmptyTitle>Nothing here yet</EmptyTitle>
              <EmptyDescription>
                {counts.items === 0
                  ? 'The feed fills once the news job has run (every 30 minutes). If it stays empty, check the news heartbeat in Settings.'
                  : 'No items match this filter. Widen it to see the rest of the stream.'}
              </EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((it) => <FeedItem key={it.id} item={it} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: 'good' | 'warn' }) {
  const cls = tone === 'good' ? 'text-(--good)' : tone === 'warn' ? 'text-(--warning)' : '';
  return (
    <Card>
      <CardHeader className="gap-1 pb-0"><CardDescription>{label}</CardDescription><CardTitle className={`font-mono text-2xl tabular-nums ${cls}`}>{value}</CardTitle></CardHeader>
      <CardContent className="pt-1 text-xs text-muted-foreground">{sub}</CardContent>
    </Card>
  );
}

function FeedItem({ item }: { item: NewsItem }) {
  const c = (item.status === 'correlated' ? item.correlation : null) as Correlation | null;
  const hasAngle = Boolean(c && item.relevant && c.angle);
  const when = item.published_at ?? item.fetched_at;
  return (
    <li className={`rounded-lg border p-4 ${item.respond_worthy ? 'border-(--warning) bg-(--warning-soft)/40' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{item.publisher ?? item.source}</Badge>
        <span>{timeAgo(when)}</span>
        {item.topics.map((t) => <Badge key={t} variant="secondary">{TOPICS.find((x) => x.id === t)?.label ?? t}</Badge>)}
        {item.respond_worthy ? <Badge className="border-transparent bg-(--warning-soft) text-(--warning)"><LightningIcon /> Respond now</Badge> : null}
        {item.signal_id ? <Badge className="border-transparent bg-(--info-soft) text-(--info)">Content signal</Badge> : null}
        {item.status === 'new' ? <Badge variant="outline">Not read yet</Badge> : null}
      </div>
      <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-start gap-1.5 text-base font-medium leading-snug hover:underline">
        <span>{item.title}</span><ArrowSquareOutIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
      </a>
      {c?.summary ? <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p> : item.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p> : null}

      {hasAngle && c ? (
        <div className="mt-3 rounded-md border border-border bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground">Our angle</div>
          <div className="mt-0.5 text-sm font-medium">{c.angle}</div>
          {c.why ? <p className="mt-1.5 text-sm text-muted-foreground">{c.why}</p> : null}
          {c.data_hook ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ChartLineUpIcon className="size-4" /><span>{c.data_hook}</span><Link href="/setnel/dashboards" className="ml-1 underline-offset-2 hover:underline">open dashboards</Link></div>
          ) : null}
          {c.numbers?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{c.numbers.map((n) => <span key={n.label} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">{n.label}: {n.value}</span>)}</div>
          ) : null}
          {c.draft ? <blockquote className="mt-3 border-l-2 border-(--brand-blue) pl-3 text-sm">{c.draft}</blockquote> : null}
        </div>
      ) : c && !item.relevant ? (
        <p className="mt-2 text-xs text-muted-foreground">Read: not something our data adds to{typeof item.confidence === 'number' ? ` (confidence ${Math.round(item.confidence * 100)}%)` : ''}.</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {item.signal_id ? (
          <form action={markNewsSignalUsed}><input type="hidden" name="signalId" value={item.signal_id} /><Button type="submit" size="sm" variant="outline">Mark used</Button></form>
        ) : null}
        <form action={dismissNewsItem}><input type="hidden" name="id" value={item.id} /><Button type="submit" size="sm" variant="ghost">Dismiss</Button></form>
      </div>
    </li>
  );
}
