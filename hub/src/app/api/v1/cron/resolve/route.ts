import { NextResponse } from 'next/server';
import { resolveStale, resolveAgedDeadLetter } from '@/lib/ingest';
import { recordHeartbeat } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Flips active incidents with no recent events to resolved, and ages out old
// dead-letter rows so the failed_notifications count can't grow unbounded.
// Call on a schedule (see .github/workflows/setnel-resolve.yml).
export async function GET() {
  const resolved = await resolveStale();
  const deadLettersCleared = await resolveAgedDeadLetter(24);
  await recordHeartbeat('resolve', `${resolved} incidents, ${deadLettersCleared} dead-letter`);
  return NextResponse.json({ ok: true, resolved, deadLettersCleared });
}
