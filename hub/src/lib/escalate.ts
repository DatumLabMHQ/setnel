import { sql, type Severity } from './db';
import { deliverAlert } from './notify';
import { getEscalation, getChannelConfigMap, channelsFor, parseRecipients, getCurrentOnCall } from './admin';
import { shouldEscalate } from './incident-logic';
import { cached } from './config-cache';
import { buildDeepLink } from './ingest';

// Escalation engine. Unacknowledged critical/emergency incidents older than the configured window are
// marked escalated (escalated_at) on every analyze pass, but since 2026-09-11 they are no longer re-paged
// one by one: the weekly escalation summary (weeklyEscalationSummary, Mondays) lists them once, by email
// to every recipient and on Telegram. Decision: Olusegun, 2026-09-11 ("escalation alert once a week").
// Set SETNEL_ESCALATION_MODE=immediate to restore per-incident re-paging.
export async function runEscalations(): Promise<{ escalated: number }> {
  const esc = await getEscalation();
  if (!esc.enabled) return { escalated: 0 };
  const channelMap = await cached('channelMap', getChannelConfigMap);
  const emailRecipients = parseRecipients(esc.emailRecipients);
  const onCall = await getCurrentOnCall(); // rotation-aware; falls back to static on-call

  const candidates = (await sql`
    SELECT i.id, i.dashboard_id, i.severity, i.message, i.link_path,
           i.opened_at, i.acknowledged_at, i.muted_until, i.escalated_at,
           d.name AS dashboard_name, d.base_url
    FROM incidents i JOIN dashboards d ON d.id = i.dashboard_id
    WHERE i.status = 'active' AND i.severity IN ('critical', 'emergency')
  `) as {
    id: string; dashboard_id: string; severity: Severity; message: string; link_path: string | null;
    opened_at: string; acknowledged_at: string | null; muted_until: string | null; escalated_at: string | null;
    dashboard_name: string; base_url: string;
  }[];

  const now = Date.now();
  const rows = candidates.filter((r) =>
    shouldEscalate(
      { severity: r.severity, acknowledgedAt: r.acknowledged_at, mutedUntil: r.muted_until, openedAt: r.opened_at, escalatedAt: r.escalated_at },
      now,
      esc.escalateAfterMin,
    ),
  );

  let escalated = 0;
  const immediate = process.env.SETNEL_ESCALATION_MODE === 'immediate';
  for (const r of rows) {
    if (!immediate) {
      await sql`UPDATE incidents SET escalated_at = now() WHERE id = ${r.id}`;
      escalated += 1;
      continue;
    }
    const oncall = onCall.name ? ` — on-call: ${onCall.name}${onCall.contact ? ` (${onCall.contact})` : ''}` : '';
    const routed = await deliverAlert({
      dashboardName: r.dashboard_name,
      severity: r.severity as 'critical' | 'emergency',
      category: 'escalation',
      message: `⏫ ESCALATION — unacknowledged ${esc.escalateAfterMin}m+: ${r.message}${oncall}`,
      deepLink: buildDeepLink(r.base_url, r.link_path, String(r.id)),
      incidentId: r.id,
      channels: channelsFor(channelMap, r.severity),
      emailRecipients,
    });
    await sql`UPDATE incidents SET escalated_at = now() WHERE id = ${r.id}`;
    if (routed.anySent) escalated += 1;
  }
  return { escalated };
}

/**
 * Weekly escalation summary: every critical/emergency incident that escalated (went unacknowledged past
 * the window) in the last 7 days, with its current state. One email to all recipients plus one Telegram
 * post. Returns the text so the caller can dry-run it.
 */
export async function weeklyEscalationSummary(days = 7, dry = false): Promise<{ count: number; text: string; sent: { email: boolean; telegram: boolean } }> {
  const esc = await getEscalation();
  const emailRecipients = parseRecipients(esc.emailRecipients);
  const rows = (await sql`
    SELECT i.id, i.severity, i.status, i.message, i.opened_at, i.escalated_at, i.acknowledged_at, i.resolved_at, i.event_count, d.name AS dashboard_name
    FROM incidents i JOIN dashboards d ON d.id = i.dashboard_id
    WHERE i.severity IN ('critical', 'emergency') AND i.escalated_at > now() - make_interval(days => ${days})
    ORDER BY (i.status = 'active') DESC, i.escalated_at DESC LIMIT 100
  `) as { id: string; severity: string; status: string; message: string; opened_at: string; escalated_at: string; acknowledged_at: string | null; resolved_at: string | null; event_count: number; dashboard_name: string }[];
  const day = (v: string | null) => (v ? new Date(v).toISOString().slice(5, 16).replace('T', ' ') : '');
  const stillOpen = rows.filter((r) => r.status === 'active' && !r.acknowledged_at);
  const lines = rows.map((r) => `• [${r.severity}] ${r.dashboard_name}: ${r.message}\n  opened ${day(r.opened_at)} · ${r.status}${r.acknowledged_at ? ' · acknowledged' : ''}${r.resolved_at ? ' · resolved ' + day(r.resolved_at) : ''} · ${r.event_count} events`);
  const hub = (process.env.SETNEL_SELF_URL || 'https://setnel.datumlab.xyz').replace(/\/$/, '');
  const text = [
    `Setnel escalations, last ${days} days: ${rows.length} incident${rows.length === 1 ? '' : 's'} went unacknowledged past ${esc.escalateAfterMin} minutes; ${stillOpen.length} still open and unacknowledged.`,
    '',
    ...(rows.length ? lines : ['Nothing escalated this week.']),
    '',
    `Acknowledge or resolve: ${hub}/setnel`,
  ].join('\n');
  if (dry || rows.length === 0) return { count: rows.length, text, sent: { email: false, telegram: false } };
  const { sendMail, notifyTelegram } = await import('./notify');
  const email = emailRecipients.length ? await sendMail(`Setnel weekly escalations: ${rows.length} (${stillOpen.length} still open)`, text, emailRecipients) : false;
  const telegram = await notifyTelegram({ dashboardName: 'Setnel', severity: 'warning', category: 'escalation', message: text.slice(0, 3500), deepLink: `${hub}/setnel` });
  return { count: rows.length, text, sent: { email, telegram } };
}
