import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getSignals, getSignalCounts, type SignalStatus } from '@/lib/signals';
import { markSignalUsed, dismissSignal, reopenSignal } from './actions';

export const dynamic = 'force-dynamic';

// Content: story angles the data platform surfaced, with a draft and the handles to tag.
// Detectors: scripts/detectors/content.mjs (runs daily, reads the platform's curated tables).
// Nothing here pages anyone; it is an editorial queue.

const TABS: { k: SignalStatus | 'all'; label: string }[] = [
  { k: 'new', label: 'New' }, { k: 'used', label: 'Used' }, { k: 'dismissed', label: 'Dismissed' }, { k: 'all', label: 'All' },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtNumber(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthed())) redirect('/login');
  const sp = await searchParams;
  const status = (TABS.some((t) => t.k === sp.status) ? sp.status : 'new') as SignalStatus | 'all';
  const days = sp.days ? Math.max(1, Math.min(90, Number(sp.days))) : 14;
  const [signals, counts] = await Promise.all([getSignals({ status, days }), getSignalCounts(days)]);

  return (
    <>
      <section className="kpis">
        <div className="kpi"><div className="kpi-label">New angles</div><div className="kpi-value">{counts.newCount}</div><div className="kpi-sub">last {days} days</div></div>
        <div className="kpi kpi-good"><div className="kpi-label">Used</div><div className="kpi-value">{counts.used}</div><div className="kpi-sub">published or scheduled</div></div>
        <div className="kpi"><div className="kpi-label">Dismissed</div><div className="kpi-value">{counts.dismissed}</div><div className="kpi-sub">not worth a post</div></div>
        <div className="kpi"><div className="kpi-label">Machine door</div><div className="kpi-value" style={{ fontSize: 14 }}><code>/api/v1/signals</code></div><div className="kpi-sub">same JSON, for the MCP server and agents</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Content signals</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <a key={t.k} href={`/setnel/content?status=${t.k}&days=${days}`} className={`chip ${status === t.k ? 'chip-on' : ''}`}>{t.label}</a>
            ))}
          </div>
        </div>
        <p className="panel-note">Each card is one angle the platform's numbers support today: a headline, a draft you can paste, the handles to tag, and the figures it was written from. Mark it used when it goes out, dismiss it when it is not a story. The same fingerprint is not raised twice within seven days.</p>
        {signals.length === 0 ? (
          <div className="empty">No {status === 'all' ? '' : status + ' '}signals in the last {days} days. The content detector runs every morning at 07:10 UTC and can be run by hand from the setnel-content workflow.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {signals.map((s) => {
              const p = s.payload;
              const numbers = Object.entries(p.numbers ?? {});
              return (
                <article key={s.id} className="panel" style={{ margin: 0 }}>
                  <div className="panel-head" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                        <span className="badge badge-exp">{p.product ?? s.dashboard_id}</span>
                        <span className="badge">{p.rule ?? s.detector_id}</span>
                        <span className={`badge ${s.signal_status === 'used' ? 'badge-resolved' : s.signal_status === 'dismissed' ? '' : 'badge-count'}`}>{s.signal_status}</span>
                        <span className="panel-note" style={{ margin: 0 }}>{fmtTime(s.fired_at)}{p.day ? ` · data day ${p.day}` : ''}</span>
                      </div>
                      <h3 style={{ margin: '4px 0 2px' }}>{s.message}</h3>
                      {p.angle ? <div className="panel-note" style={{ margin: 0 }}>{p.angle}</div> : null}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {s.signal_status !== 'used' ? (
                        <form action={markSignalUsed}><input type="hidden" name="id" value={s.id} /><button className="chip" type="submit">Mark used</button></form>
                      ) : null}
                      {s.signal_status !== 'dismissed' ? (
                        <form action={dismissSignal}><input type="hidden" name="id" value={s.id} /><button className="chip" type="submit">Dismiss</button></form>
                      ) : null}
                      {s.signal_status !== 'new' ? (
                        <form action={reopenSignal}><input type="hidden" name="id" value={s.id} /><button className="chip" type="submit">Reopen</button></form>
                      ) : null}
                    </div>
                  </div>
                  {p.draft ? (
                    <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}>{p.draft}</pre>
                  ) : null}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    {p.handles && p.handles.length > 0 ? (
                      <div className="panel-note" style={{ margin: 0 }}>Tag: {p.handles.join(' ')}</div>
                    ) : null}
                    {numbers.length > 0 ? (
                      <div className="panel-note" style={{ margin: 0 }}>
                        {numbers.map(([k, v]) => `${k} ${fmtNumber(v)}`).join(' · ')}
                      </div>
                    ) : null}
                    {p.source ? <div className="panel-note" style={{ margin: 0 }}>Source: <code>{p.source}</code></div> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
