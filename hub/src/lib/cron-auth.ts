import { NextResponse } from 'next/server';

// Shared guard for the hub's scheduled routes (/api/v1/analyze, /crosscheck,
// /cron/resolve). Fails closed: a deploy without SETNEL_CRON_SECRET rejects
// every call instead of running unauthenticated. Callers pass ?key=<secret>.
export function requireCronKey(req: Request): NextResponse | null {
  const secret = process.env.SETNEL_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SETNEL_CRON_SECRET not set' }, { status: 500 });
  }
  const key = new URL(req.url).searchParams.get('key');
  if (key !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
