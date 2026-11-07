import { NextResponse } from 'next/server';
import { getWeeklyReport, getSloTargets, getEscalation, parseRecipients, recordHeartbeat } from '@/lib/admin';
import { sendMail, emailConfigured } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/report/digest?key=<SETNEL_CRON_SECRET>
// Emails a plain-text weekly digest to the escalation recipients. Point a weekly
// GitHub Actions cron at this so "weekly report" is a real delivered summary, not
// just a CSV button someone has to remember to click.
export async function GET(req: Request) {
  const secret = process.env.SETNEL_CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    if (key !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!emailConfigured()) return NextResponse.json({ ok: false, reason: 'email not configured' });

  const [weeks, slo, esc] = await Promise.all([getWeeklyReport(4), getSloTargets(), getEscalation()]);
  const recipients = parseRecipients(esc.emailRecipients);
  if (!recipients.length) return NextResponse.json({ ok: false, reason: 'no recipients' });

  const latest = weeks[weeks.length - 1];
  const lines = [
    'Setnel weekly digest',
    '',
    latest
      ? `This week: ${latest.incidents} incidents · ${latest.ackedPct}% acked (target ≥${slo.ackRateTarget}%) · MTTA ${latest.mttaMin ?? '—'}m (≤${slo.mttaTargetMin}) · MTTR ${latest.mttrMin ?? '—'}m (≤${slo.mttrTargetMin}) · ${latest.falsePositives} FPs`
      : 'No incidents this week.',
    '',
    'Last 4 weeks:',
    ...weeks.map((w) => `  ${w.week}: ${w.incidents} inc, ${w.falsePositives} FP, ack ${w.ackedPct}%, MTTA ${w.mttaMin ?? '—'}m, MTTR ${w.mttrMin ?? '—'}m`),
    '',
    'Full reports: https://setnel-hub.datumlabs.workers.dev/setnel/reports',
  ].join('\n');

  const sent = await sendMail('Setnel weekly digest', lines, recipients);
  await recordHeartbeat('digest', sent ? `sent to ${recipients.length}` : 'send failed');
  return NextResponse.json({ ok: sent, recipients: recipients.length });
}
