import { NextResponse } from 'next/server';
import { requireCronKey } from '@/lib/cron-auth';
import { getSignals, type SignalStatus } from '@/lib/signals';

export const dynamic = 'force-dynamic';

// Machine door for content signals: the MCP server and the agent tools read this.
// GET /api/v1/signals?key=<SETNEL_CRON_SECRET>&status=new|used|dismissed|all&days=14&limit=200
export async function GET(req: Request) {
  const denied = requireCronKey(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') ?? 'new') as SignalStatus | 'all';
  const days = Number(url.searchParams.get('days') ?? 14);
  const limit = Number(url.searchParams.get('limit') ?? 200);
  const rows = await getSignals({ status, days, limit });
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: rows.length,
    signals: rows.map((r) => ({
      id: r.id, status: r.signal_status, firedAt: r.fired_at, dashboard: r.dashboard_id, detector: r.detector_id,
      headline: r.message, angle: r.payload.angle ?? null, draft: r.payload.draft ?? null,
      handles: r.payload.handles ?? [], numbers: r.payload.numbers ?? {}, source: r.payload.source ?? null, day: r.payload.day ?? null,
    })),
  });
}
