import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This route exposes alert content, so it FAILS CLOSED: it is disabled unless
// SETNEL_CRON_SECRET is set, and every call must present ?key=<that secret>.
function guard(req: Request): NextResponse | null {
  const secret = process.env.SETNEL_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'endpoint disabled — set SETNEL_CRON_SECRET' }, { status: 503 });
  }
  if (new URL(req.url).searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

// GET /api/v1/deadletter?key=<SETNEL_CRON_SECRET>[&all=1]
// Lists undelivered alerts sitting in the dead-letter, so you can see which
// alerts never reached you and why. By default only unresolved rows; ?all=1
// also includes rows resolved in the last 7 days (to inspect what was drained).
export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const all = new URL(req.url).searchParams.get('all') === '1';
  const rows = all
    ? await sql`
        SELECT id, channel, incident_id, error, attempts, created_at, resolved_at,
               left(message, 240) AS message_preview
        FROM failed_notifications
        WHERE resolved_at IS NULL OR resolved_at > now() - interval '7 days'
        ORDER BY created_at DESC
        LIMIT 200`
    : await sql`
        SELECT id, channel, incident_id, error, attempts, created_at,
               left(message, 240) AS message_preview
        FROM failed_notifications
        WHERE resolved_at IS NULL
        ORDER BY created_at DESC
        LIMIT 200`;

  return NextResponse.json({ ok: true, count: rows.length, rows });
}

// POST /api/v1/deadletter?key=<SETNEL_CRON_SECRET>
// Manually drains the dead-letter now: marks every currently-unresolved row
// resolved, regardless of age. Use to clear a known backlog immediately rather
// than waiting for the age-out cron.
export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const rows = (await sql`
    UPDATE failed_notifications
    SET resolved_at = now()
    WHERE resolved_at IS NULL
    RETURNING id
  `) as { id: string }[];

  return NextResponse.json({ ok: true, resolved: rows.length });
}
