// The news feed: what the market is saying, read against what our data says.
//
// 1. fetchSources()  pulls recent items per topic from Google News RSS (and X recent search when
//    X_BEARER_TOKEN is set), deduped by a hash of the normalised url.
// 2. correlate()     gives each new item, plus our live figures for the protocols it touches
//    (latest metrics with 24h/7d change, active incidents, recent content signals), to Claude,
//    which returns a strict JSON verdict: relevant or not, the angle, why it matters, which of
//    our metrics backs it, a draft post built only from the given figures, and whether it is
//    worth responding to now.
// 3. A relevant verdict is also posted as a content signal (events, detector_id 'news') through
//    the same ingest path the rules engine uses, so it shows on the Content page, in
//    /api/v1/signals and in the daily brief. respond_worthy ones go in at 'warning', which the
//    hub emails at once; the rest wait for the brief.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { sql, type DashboardRow } from './db';
import { ingestBatch } from './ingest';
import type { IncomingEvent } from './types';

// ── Topics: what we watch, which of our dashboards it maps to, and how to search for it ──
export type Topic = { id: string; label: string; query: string; dashboards: string[]; keywords: string[] };
export const TOPICS: Topic[] = [
  { id: 'aave', label: 'Aave', query: 'Aave OR "Aave V3" OR "Aave DAO" OR GHO stablecoin', dashboards: ['aave'], keywords: ['aave', 'gho'] },
  { id: 'sui', label: 'Sui', query: '"Sui" DeFi lending OR "Navi Protocol" OR "Scallop" Sui', dashboards: ['sui', 'navi'], keywords: ['sui', 'navi', 'scallop'] },
  { id: 'rwa', label: 'RWA', query: 'Centrifuge OR "tokenized treasuries" OR "real world assets" DeFi', dashboards: ['rwa', 'centrifuge'], keywords: ['centrifuge', 'rwa', 'tokenized', 'tokenised', 'treasur'] },
  { id: 'spark', label: 'Spark', query: '"Spark Protocol" OR SparkLend OR "Sky Protocol" OR MakerDAO', dashboards: ['sparklend'], keywords: ['spark', 'sky protocol', 'maker'] },
  { id: 'lending', label: 'DeFi lending', query: '"DeFi lending" OR "liquidation cascade" OR "stablecoin depeg" OR "Morpho" OR "Fluid protocol"', dashboards: ['platform', 'lending_intel', 'liquidator', 'defi_tvl'], keywords: ['lending', 'liquidat', 'depeg', 'morpho', 'fluid', 'compound', 'euler'] },
];
const topicById = (id: string) => TOPICS.find((t) => t.id === id);

// ── Shapes ──
export type NewsItem = {
  id: string; source: string; publisher: string | null; url: string; title: string; summary: string | null;
  published_at: string | null; fetched_at: string; topics: string[]; status: 'new' | 'correlated' | 'skipped' | 'dismissed';
  relevant: boolean | null; confidence: number | null; respond_worthy: boolean; correlation: Correlation | Record<string, never>;
  signal_id: string | null; correlated_at: string | null;
};
type RawItem = { source: string; publisher: string | null; url: string; title: string; summary: string | null; published_at: string | null; topic: string };

// ── Schema (idempotent, so the cron works before db:migrate has run; the migration is the record) ──
let ensured = false;
export async function ensureNewsSchema(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS news_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source TEXT NOT NULL, publisher TEXT, url TEXT NOT NULL,
    url_hash TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT, published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), topics TEXT[] NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'new',
    relevant BOOLEAN, confidence REAL, respond_worthy BOOLEAN NOT NULL DEFAULT false, correlation JSONB NOT NULL DEFAULT '{}',
    signal_id BIGINT, correlated_at TIMESTAMPTZ)`;
  await sql`CREATE INDEX IF NOT EXISTS news_items_published_idx ON news_items (published_at DESC NULLS LAST)`;
  await sql`CREATE INDEX IF NOT EXISTS news_items_new_idx ON news_items (fetched_at) WHERE status = 'new'`;
  ensured = true;
}

// ── Sources ──
const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : ''; };

async function get(url: string, headers: Record<string, string> = {}, ms = 10000): Promise<string | null> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'user-agent': 'setnel-news/1 (+https://setnel.datumlab.xyz)', ...headers } });
    return res.ok ? await res.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Google News RSS for one topic query. Titles arrive as "Headline - Publisher"; the publisher is also its own tag. */
async function googleNews(topic: Topic): Promise<RawItem[]> {
  const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(topic.query + ' when:3d')}&hl=en-US&gl=US&ceid=US:en`);
  if (!xml) return [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return items.slice(0, 25).map((it) => {
    const publisher = tag(it, 'source') || null;
    let title = tag(it, 'title');
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const pub = tag(it, 'pubDate'); const d = pub ? new Date(pub) : null;
    return { source: 'google-news', publisher, url: tag(it, 'link'), title, summary: tag(it, 'description').slice(0, 600) || null, published_at: d && !Number.isNaN(+d) ? d.toISOString() : null, topic: topic.id };
  }).filter((i) => i.url && i.title);
}

/** X recent search (API v2), only when X_BEARER_TOKEN is set; best-effort and silent on failure. */
async function xSearch(topic: Topic): Promise<RawItem[]> {
  const token = process.env.X_BEARER_TOKEN; if (!token) return [];
  const q = `(${topic.query.replace(/\s+OR\s+/g, ' OR ')}) -is:retweet lang:en`;
  const u = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=20&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username`;
  const body = await get(u, { authorization: `Bearer ${token}` });
  if (!body) return [];
  try {
    const j = JSON.parse(body) as { data?: { id: string; text: string; created_at?: string; author_id?: string }[]; includes?: { users?: { id: string; username: string }[] } };
    const users = new Map((j.includes?.users ?? []).map((x) => [x.id, x.username]));
    return (j.data ?? []).map((t) => { const handle = users.get(t.author_id ?? '') ?? 'x'; return { source: 'x', publisher: `@${handle}`, url: `https://x.com/${handle}/status/${t.id}`, title: t.text.replace(/\s+/g, ' ').slice(0, 200), summary: t.text.slice(0, 600), published_at: t.created_at ?? null, topic: topic.id }; });
  } catch { return []; }
}

const normalise = (url: string) => { try { const u = new URL(url); u.hash = ''; [...u.searchParams.keys()].filter((k) => /^utm_|^fbclid$|^gclid$/.test(k)).forEach((k) => u.searchParams.delete(k)); u.hostname = u.hostname.toLowerCase(); return u.toString().replace(/\/$/, ''); } catch { return url.trim(); } };
const hashOf = (url: string) => createHash('sha256').update(normalise(url)).digest('hex');

/** Pull every source for every topic and store what is new. Returns how many were inserted. */
export async function fetchSources(): Promise<{ fetched: number; inserted: number }> {
  await ensureNewsSchema();
  const batches = await Promise.all(TOPICS.flatMap((t) => [googleNews(t), xSearch(t)]));
  const byHash = new Map<string, RawItem & { topics: Set<string> }>();
  for (const it of batches.flat()) {
    const h = hashOf(it.url); const cur = byHash.get(h);
    if (cur) cur.topics.add(it.topic); else byHash.set(h, { ...it, topics: new Set([it.topic]) });
  }
  let inserted = 0;
  for (const [h, it] of byHash) {
    const rows = (await sql`
      INSERT INTO news_items (source, publisher, url, url_hash, title, summary, published_at, topics)
      VALUES (${it.source}, ${it.publisher}, ${it.url}, ${h}, ${it.title.slice(0, 500)}, ${it.summary}, ${it.published_at}, ${[...it.topics]})
      ON CONFLICT (url_hash) DO UPDATE SET topics = (SELECT array(SELECT DISTINCT unnest(news_items.topics || EXCLUDED.topics)))
      RETURNING (xmax = 0) AS inserted`) as { inserted: boolean }[];
    if (rows[0]?.inserted) inserted++;
  }
  return { fetched: byHash.size, inserted };
}

// ── Our data, for the protocols an item touches ──
async function dataContext(dashboardIds: string[]): Promise<string> {
  if (!dashboardIds.length) return 'No dashboard of ours covers this directly.';
  const latest = (await sql`
    SELECT DISTINCT ON (dashboard_id, metric_key) dashboard_id, metric_key, value, ts
    FROM metric_samples WHERE dashboard_id = ANY(${dashboardIds}) AND ts > now() - interval '2 days'
    ORDER BY dashboard_id, metric_key, ts DESC`) as { dashboard_id: string; metric_key: string; value: number; ts: string }[];
  const dayAgo = (await sql`
    SELECT DISTINCT ON (dashboard_id, metric_key) dashboard_id, metric_key, value
    FROM metric_samples WHERE dashboard_id = ANY(${dashboardIds}) AND ts <= now() - interval '1 day' AND ts > now() - interval '3 days'
    ORDER BY dashboard_id, metric_key, ts DESC`) as { dashboard_id: string; metric_key: string; value: number }[];
  const weekAgo = (await sql`
    SELECT DISTINCT ON (dashboard_id, metric_key) dashboard_id, metric_key, value
    FROM metric_samples WHERE dashboard_id = ANY(${dashboardIds}) AND ts <= now() - interval '7 days' AND ts > now() - interval '9 days'
    ORDER BY dashboard_id, metric_key, ts DESC`) as { dashboard_id: string; metric_key: string; value: number }[];
  const incidents = (await sql`
    SELECT dashboard_id, severity, message, opened_at, status FROM incidents
    WHERE dashboard_id = ANY(${dashboardIds}) AND opened_at > now() - interval '7 days'
    ORDER BY opened_at DESC LIMIT 10`) as { dashboard_id: string; severity: string; message: string; opened_at: string; status: string }[];
  const signals = (await sql`
    SELECT message, fired_at FROM events WHERE category = 'signal' AND detector_id <> 'news'
      AND (dashboard_id = ANY(${dashboardIds}) OR payload->>'product' = ANY(${dashboardIds}))
      AND fired_at > now() - interval '7 days' ORDER BY fired_at DESC LIMIT 8`) as { message: string; fired_at: string }[];
  const key = (r: { dashboard_id: string; metric_key: string }) => `${r.dashboard_id}|${r.metric_key}`;
  const d1 = new Map(dayAgo.map((r) => [key(r), r.value])); const d7 = new Map(weekAgo.map((r) => [key(r), r.value]));
  const pct = (a: number, b: number | undefined) => b == null || b === 0 ? 'n/a' : `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%`;
  const fmt = (v: number) => Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v * 100) / 100);
  const lines = latest.slice(0, 40).map((r) => `- ${r.metric_key} (${r.dashboard_id}): ${fmt(r.value)} as of ${r.ts.slice(0, 16)}Z; 24h ${pct(r.value, d1.get(key(r)))}, 7d ${pct(r.value, d7.get(key(r)))}`);
  return [
    lines.length ? `Latest metrics:\n${lines.join('\n')}` : 'No metric samples in the last 2 days for these dashboards.',
    incidents.length ? `Incidents (7d):\n${incidents.map((i) => `- [${i.severity}/${i.status}] ${i.dashboard_id}: ${i.message} (${i.opened_at.slice(0, 10)})`).join('\n')}` : 'No incidents in the last 7 days.',
    signals.length ? `Content signals we already have (7d), do not duplicate:\n${signals.map((s) => `- ${s.message} (${s.fired_at.slice(0, 10)})`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

// ── Correlation ──
const Correlation = z.object({
  relevant: z.boolean().describe('True only if this touches DeFi lending risk, liquidations, RWA, stablecoins or a protocol we track, and our data can add to it.'),
  confidence: z.number().describe('0 to 1.'),
  protocols: z.array(z.string()).describe('Protocol or product names this is about, lower case.'),
  summary: z.string().describe('One sentence: what happened, for a smart reader outside DeFi.'),
  angle: z.string().describe('One line: the content angle our data gives us. Empty if not relevant.'),
  why: z.string().describe('Two or three sentences: why it matters and what our figures show. Empty if not relevant.'),
  data_hook: z.string().describe('Which of our metrics or charts backs the angle, named as in the data given. Empty if none.'),
  numbers: z.array(z.object({ label: z.string(), value: z.string() })).describe('The figures used, copied exactly from the data given, with the day.'),
  draft: z.string().describe('A post we could publish: two or three sentences, sentence case, no hashtags, no em dashes, only the given figures. Empty if not relevant.'),
  respond_worthy: z.boolean().describe('True only if it is timely (under 48h), our data adds something the piece lacks, and a reply or post now would land.'),
});
export type Correlation = z.infer<typeof Correlation>;

const MODEL = process.env.NEWS_MODEL || process.env.BRIEF_MODEL || 'claude-opus-5';
const SYSTEM = `You are the content desk analyst at Datum Labs, which runs Setnel: risk monitoring for DeFi lending dashboards (Aave, Sui lending, Spark, RWA and tokenized treasuries, cross-protocol liquidations and TVL). You are given one news item and our own live figures for the protocols it touches. Decide whether the item is relevant to what we cover and whether our data adds something to it, and if so produce the angle and a draft post.
Rules that override everything: use only figures that appear in the data you are given; never invent, round beyond what is given, or extrapolate. Name the protocol and the day for each figure. Do not repeat an angle that appears under the signals we already have. If the item is not relevant, say so and leave the angle, why, data_hook and draft empty. Plain, direct sentences. No em dashes anywhere. Sentence case.`;

async function correlateOne(item: NewsItem): Promise<Correlation | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const dashboards = [...new Set(item.topics.flatMap((t) => topicById(t)?.dashboards ?? []))];
  const context = await dataContext(dashboards);
  const client = new Anthropic();
  const user = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`, '',
    `News item (${item.source}${item.publisher ? `, ${item.publisher}` : ''}, published ${item.published_at ? item.published_at.slice(0, 16) + 'Z' : 'unknown'}):`,
    `Title: ${item.title}`, item.summary ? `Summary: ${item.summary}` : '', `URL: ${item.url}`, '',
    `Our data:`, context,
  ].filter((l) => l !== '').join('\n');
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(Correlation) },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') return null;
  return res.parsed_output ?? null;
}

async function promoteToSignal(item: NewsItem, c: Correlation): Promise<string | null> {
  const rows = (await sql`SELECT * FROM dashboards WHERE id = 'platform' LIMIT 1`) as DashboardRow[];
  if (!rows[0]) return null;
  const topic = topicById(item.topics[0] ?? '')?.label ?? 'Market';
  const day = (item.published_at ?? item.fetched_at).slice(0, 10);
  const ev: IncomingEvent = {
    detectorId: 'news',
    category: 'signal',
    severity: c.respond_worthy ? 'warning' : 'info',
    message: `${topic}: ${c.angle}`.slice(0, 1000),
    fingerprint: `news:${hashOf(item.url)}`,
    cooldownHours: 168,
    linkPath: `/setnel/feed?item=${item.id}`,
    payload: {
      rule: 'news', angle: c.angle, draft: c.draft, handles: [],
      numbers: Object.fromEntries(c.numbers.map((n) => [n.label, n.value])),
      source: item.url, product: c.protocols[0] ?? topic.toLowerCase(), day,
      headline: item.title, publisher: item.publisher, why: c.why, dataHook: c.data_hook, newsId: item.id,
    },
  };
  await ingestBatch(rows[0], [ev]);
  const stored = (await sql`SELECT id FROM events WHERE category = 'signal' AND fingerprint = ${ev.fingerprint} ORDER BY fired_at DESC LIMIT 1`) as { id: string }[];
  return stored[0] ? String(stored[0].id) : null;
}

/** Correlate up to `limit` new items (newest first, only the last 3 days), promoting the relevant ones to signals. */
export async function correlate(limit = 8): Promise<{ looked: number; relevant: number; promoted: number; skipped: number; errors: number }> {
  await ensureNewsSchema();
  await sql`UPDATE news_items SET status = 'skipped' WHERE status = 'new' AND published_at IS NOT NULL AND published_at < now() - interval '3 days'`;
  const items = (await sql`SELECT * FROM news_items WHERE status = 'new' ORDER BY published_at DESC NULLS LAST, fetched_at DESC LIMIT ${limit}`) as NewsItem[];
  let relevant = 0, promoted = 0, errors = 0;
  for (const raw of items) {
    const item = { ...raw, id: String(raw.id), topics: raw.topics ?? [] };
    try {
      const c = await correlateOne(item);
      if (!c) { await sql`UPDATE news_items SET status = 'skipped' WHERE id = ${item.id}`; continue; }
      const confidence = Math.max(0, Math.min(1, Number(c.confidence) || 0));
      const isRelevant = c.relevant && confidence >= 0.6 && c.angle.trim().length > 0;
      let signalId: string | null = null;
      if (isRelevant) { relevant++; signalId = await promoteToSignal(item, c); if (signalId) promoted++; }
      await sql`UPDATE news_items SET status = 'correlated', relevant = ${isRelevant}, confidence = ${confidence}, respond_worthy = ${isRelevant && c.respond_worthy},
        correlation = ${JSON.stringify(c)}::jsonb, signal_id = ${signalId}, correlated_at = now() WHERE id = ${item.id}`;
    } catch (err) { errors++; console.error('[news] correlate failed', item.id, err instanceof Error ? err.message : err); }
  }
  return { looked: items.length, relevant, promoted, skipped: 0, errors };
}

// ── Reads for the Feed page ──
export type FeedFilter = 'all' | 'relevant' | 'respond';
export async function getFeed(opts: { filter?: FeedFilter; topic?: string; days?: number; limit?: number } = {}): Promise<NewsItem[]> {
  await ensureNewsSchema();
  const filter = opts.filter ?? 'all'; const days = Math.max(1, Math.min(30, opts.days ?? 7)); const limit = Math.max(1, Math.min(200, opts.limit ?? 100));
  const topic = opts.topic ?? '';
  const rows = (await sql`
    SELECT * FROM news_items
    WHERE status <> 'dismissed' AND COALESCE(published_at, fetched_at) > now() - (${days} || ' days')::interval
      AND (${filter} = 'all' OR (${filter} = 'relevant' AND relevant = true) OR (${filter} = 'respond' AND respond_worthy = true))
      AND (${topic} = '' OR ${topic} = ANY(topics))
    ORDER BY respond_worthy DESC, relevant DESC NULLS LAST, COALESCE(published_at, fetched_at) DESC
    LIMIT ${limit}`) as NewsItem[];
  return rows.map((r) => ({ ...r, id: String(r.id), signal_id: r.signal_id == null ? null : String(r.signal_id), topics: r.topics ?? [], correlation: (r.correlation ?? {}) as NewsItem['correlation'] }));
}
export async function getFeedCounts(days = 7): Promise<{ items: number; relevant: number; respond: number; promoted: number; pending: number }> {
  await ensureNewsSchema();
  const [r] = (await sql`
    SELECT count(*)::int AS items, count(*) FILTER (WHERE relevant)::int AS relevant, count(*) FILTER (WHERE respond_worthy)::int AS respond,
           count(*) FILTER (WHERE signal_id IS NOT NULL)::int AS promoted, count(*) FILTER (WHERE status = 'new')::int AS pending
    FROM news_items WHERE status <> 'dismissed' AND COALESCE(published_at, fetched_at) > now() - (${days} || ' days')::interval`) as { items: number; relevant: number; respond: number; promoted: number; pending: number }[];
  return r ?? { items: 0, relevant: 0, respond: 0, promoted: 0, pending: 0 };
}
export async function setNewsStatus(id: string, status: 'dismissed' | 'correlated'): Promise<void> {
  await sql`UPDATE news_items SET status = ${status} WHERE id = ${id}`;
}
