import { NextResponse } from 'next/server';
import { requireCronKey } from '@/lib/cron-auth';
import { recordHeartbeat } from '@/lib/admin';
import { fetchSources, correlate } from '@/lib/news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/v1/news?key=<SETNEL_CRON_SECRET>[&correlate=8]
// Pulls the sources, stores what is new, then correlates a bounded batch against our data and
// promotes the relevant items to content signals. The datum-scheduler worker calls this every
// 30 minutes; it is idempotent, so a run that times out just picks up where it left off.
export async function GET(req: Request) {
  const denied = requireCronKey(req);
  if (denied) return denied;
  const limit = Math.max(0, Math.min(20, Number(new URL(req.url).searchParams.get('correlate') ?? 8)));
  const pulled = await fetchSources();
  const done = limit ? await correlate(limit) : { looked: 0, relevant: 0, promoted: 0, skipped: 0, errors: 0 };
  await recordHeartbeat('news', `${pulled.inserted} new, ${done.relevant} relevant, ${done.promoted} promoted`);
  return NextResponse.json({ ok: true, ...pulled, ...done });
}
