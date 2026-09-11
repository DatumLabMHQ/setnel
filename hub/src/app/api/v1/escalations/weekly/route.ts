import { NextResponse } from 'next/server';
import { requireCronKey } from '@/lib/cron-auth';
import { weeklyEscalationSummary } from '@/lib/escalate';
import { recordHeartbeat } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/v1/escalations/weekly?key=<SETNEL_CRON_SECRET>[&days=7][&dry=1]
// The once-a-week escalation summary (Mondays, dispatched by the datum-scheduler worker).
export async function GET(req: Request) {
  const denied = requireCronKey(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(31, Number(url.searchParams.get('days') ?? 7)));
  const dry = url.searchParams.get('dry') === '1';
  const r = await weeklyEscalationSummary(days, dry);
  if (dry) return new NextResponse(r.text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-count': String(r.count) } });
  await recordHeartbeat('escalations-weekly', `${r.count} escalations, email ${r.sent.email ? 'sent' : 'skipped'}, telegram ${r.sent.telegram ? 'sent' : 'skipped'}`);
  return NextResponse.json(r);
}
