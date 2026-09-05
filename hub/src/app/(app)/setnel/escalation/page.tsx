import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getEscalation, getRecentEscalations, getChannels, getRotation, getCurrentOnCall } from '@/lib/admin';
import { fmtTime } from '@/lib/format';
import { saveEscalation, saveChannel, saveRotation } from '../config-actions';

export const dynamic = 'force-dynamic';

const SEV: Record<string, string> = { info: 'sev-info', warning: 'sev-warning', critical: 'sev-critical', emergency: 'sev-emergency' };

export default async function EscalationPage() {
  if (!(await isAuthed())) redirect('/login');
  const [esc, recent, channels, rotation, onCall] = await Promise.all([
    getEscalation(), getRecentEscalations(), getChannels(), getRotation(), getCurrentOnCall(),
  ]);
  const telegramOk = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const emailOk = Boolean(process.env.ONCHAINSUITE_SECRET_KEY) || Boolean(process.env.RESEND_API_KEY && process.env.SETNEL_EMAIL_FROM);
  const rosterText = rotation.map((r) => (r.contact ? `${r.member} <${r.contact}>` : r.member)).join('\n');

  return (
    <>
      <section className="panel">
        <div className="panel-head"><h2>On-call now</h2><span className="panel-note">{onCall.rotating ? 'from the weekly rotation' : 'static on-call (no rotation set)'}</span></div>
        <div className="kpis" style={{ marginTop: 4 }}>
          <div className={`kpi ${onCall.name ? 'kpi-good' : 'kpi-warn'}`}>
            <div className="kpi-label">Current on-call</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{onCall.name ?? 'nobody set'}</div>
            <div className="kpi-sub">{onCall.contact ?? (onCall.name ? 'no contact' : 'set a rotation or static on-call below')}</div>
          </div>
          <div className="kpi"><div className="kpi-label">Rotation</div><div className="kpi-value">{rotation.length || '—'}</div><div className="kpi-sub">people · weekly handoff</div></div>
          <div className="kpi"><div className="kpi-label">Delivery</div><div className="kpi-value" style={{ fontSize: 16 }}>Telegram{emailOk ? ' + email' : ''}</div><div className="kpi-sub">no phone/SMS paging (yet)</div></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>On-call rotation</h2><span className="panel-note">one per line: <code>Name &lt;contact&gt;</code> · rotates weekly</span></div>
        <form action={saveRotation}>
          <textarea className="login-input" name="roster" rows={Math.max(4, rotation.length + 1)} defaultValue={rosterText} placeholder={'Olusegun <@olusegun>\nAda <ada@datumlab.xyz>'} style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 13 }} />
          <div className="actions"><button className="act act-primary" type="submit">Save rotation</button></div>
        </form>
        <p className="panel-note" style={{ marginTop: 8 }}>
          Empty rotation → escalations fall back to the static on-call below. This rotates who is <i>named</i> in the page; delivery is still Telegram/email to the team channel, not a personal phone call.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Escalation policy</h2><span className="panel-note">who gets paged when nobody acks</span></div>
        <p className="panel-note" style={{ marginBottom: 14 }}>
          When a <b>critical</b> or <b>emergency</b> incident stays unacknowledged past the window below, Setnel re-pages
          tagged <code>⏫ ESCALATION</code> with the current on-call. Acknowledging or muting an incident stops its escalation.
        </p>
        <form action={saveEscalation}>
          <div className="kpis" style={{ marginTop: 0 }}>
            <label className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">Escalate after (minutes)</div>
              <input className="actor-input" style={{ width: '100%', marginTop: 8 }} name="minutes" type="number" min="1" max="1440" defaultValue={esc.escalateAfterMin} />
            </label>
            <label className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">On-call name</div>
              <input className="actor-input" style={{ width: '100%', marginTop: 8 }} name="oncallName" maxLength={80} defaultValue={esc.oncallName ?? ''} placeholder="e.g. Olusegun" />
            </label>
            <label className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">On-call contact</div>
              <input className="actor-input" style={{ width: '100%', marginTop: 8 }} name="oncallContact" maxLength={120} defaultValue={esc.oncallContact ?? ''} placeholder="@handle / phone" />
            </label>
            <label className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">Escalation</div>
              <select className="actor-input" style={{ width: '100%', marginTop: 8 }} name="enabled" defaultValue={String(esc.enabled)}>
                <option value="true">enabled</option>
                <option value="false">paused</option>
              </select>
            </label>
            <label className="kpi" style={{ display: 'block', gridColumn: '1 / -1' }}>
              <div className="kpi-label">Email recipients <span className="kpi-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>· comma or space separated</span></div>
              <input className="actor-input" style={{ width: '100%', marginTop: 8 }} name="emailRecipients" maxLength={500} defaultValue={esc.emailRecipients ?? ''} placeholder="oncall@datumlab.xyz, lead@datumlab.xyz" />
            </label>
          </div>
          <div className="actions"><button className="act act-primary" type="submit">Save escalation policy</button></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Notification channels</h2><span className="panel-note">where each severity is delivered</span></div>
        <div className="legend" style={{ marginTop: 0, marginBottom: 12 }}>
          <span className="legend-item"><i className={`cov-key ${telegramOk ? 'cov-yes' : 'cov-blocked'}`}>{telegramOk ? '✓' : '✕'}</i> Telegram {telegramOk ? 'connected' : 'not configured'}</span>
          <span className="legend-item"><i className={`cov-key ${emailOk ? 'cov-yes' : 'cov-blocked'}`}>{emailOk ? '✓' : '✕'}</i> Email {emailOk ? (process.env.ONCHAINSUITE_SECRET_KEY ? 'via Onchain Suite' : 'via Resend') : 'needs ONCHAINSUITE_SECRET_KEY'}</span>
        </div>
        <div className="cov-wrap">
          <table className="cov-table">
            <thead><tr><th align="left">Severity</th><th>Telegram</th><th>Email</th><th></th></tr></thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.severity}>
                  <td align="left"><span className={`badge ${SEV[c.severity] ?? ''}`}>{c.severity}</span></td>
                  <td colSpan={3} align="left">
                    <form action={saveChannel} className="actor-form">
                      <input type="hidden" name="severity" value={c.severity} />
                      <label className="chan-check"><input type="checkbox" name="telegram" defaultChecked={c.telegram} /> Telegram</label>
                      <label className="chan-check"><input type="checkbox" name="email" defaultChecked={c.email} /> Email</label>
                      <button className="act" type="submit">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-note" style={{ marginTop: 10 }}>
          <b>info</b> never pages. If a severity has Email on but no provider key is set, the send is skipped and dead-lettered — Telegram stays the reliable default.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Recent escalations</h2><span className="panel-note">last {recent.length} paged past the window</span></div>
        {recent.length === 0 ? (
          <p className="panel-note">No escalations yet. Incidents that get acknowledged in time never reach here.</p>
        ) : (
          <ul className="timeline">
            {recent.map((r) => (
              <li key={r.id} className="tl-note">
                <span className="tl-time">{fmtTime(r.escalated_at)}</span>
                <span className={`badge ${SEV[r.severity] ?? ''}`}>{r.severity}</span>{' '}
                <b>{r.dashboard_name}</b> — <a className="card-detail" href={`/setnel/incident/${r.id}`}>{r.message}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
