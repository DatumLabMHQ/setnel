import { NextResponse } from 'next/server';
import { requireCronKey } from '@/lib/cron-auth';
import { buildDigest } from '@/lib/digest';
import { sendMail, emailConfigured } from '@/lib/notify';
import { recordHeartbeat } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/v1/content/digest?key=<SETNEL_CRON_SECRET>[&days=1][&dry=1]
// Emails the last window's new content signals to SETNEL_CONTENT_RECIPIENTS (comma-separated).
// dry=1 returns the text without sending. Called daily by the scheduler after the content rules run.
export async function GET(req: Request) {
  const denied = requireCronKey(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(14, Number(url.searchParams.get('days') ?? 1)));
  const dry = url.searchParams.get('dry') === '1';
  const force = url.searchParams.get('rebrief') === '1';   // recompose the day's brief even if one exists
  const recipients = (process.env.SETNEL_CONTENT_RECIPIENTS ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const d = await buildDigest(days, { force });
  if (dry) return new NextResponse(d.text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-signal-count': String(d.count), 'x-recipients': String(recipients.length) } });
  if (!recipients.length) return NextResponse.json({ error: 'SETNEL_CONTENT_RECIPIENTS not set', count: d.count }, { status: 500 });
  if (!emailConfigured()) return NextResponse.json({ error: 'email not configured', count: d.count }, { status: 500 });
  const sent = await sendMail(d.subject, d.text, recipients);
  await recordHeartbeat('content-digest', `${d.count} signals to ${recipients.length} recipients${sent ? '' : ' (send failed)'}`);
  return NextResponse.json({ sent, count: d.count, recipients: recipients.length, subject: d.subject, brief: d.brief ? d.brief.model : null });
}
