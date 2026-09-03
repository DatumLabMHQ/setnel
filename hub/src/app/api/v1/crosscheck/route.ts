import { NextResponse } from 'next/server';
import { requireCronKey } from '@/lib/cron-auth';
import { runCrossChecks } from '@/lib/crosscheck';
import { recordHeartbeat } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/crosscheck?key=<SETNEL_CRON_SECRET>
// Compares dashboard-reported metrics against independent sources (DeFiLlama)
// and raises data-integrity incidents on divergence. Triggered hourly by the
// setnel-crosscheck GitHub Actions workflow.
export async function GET(req: Request) {
  const denied = requireCronKey(req);
  if (denied) return denied;
  const out = await runCrossChecks();
  await recordHeartbeat('crosscheck');
  return NextResponse.json({ ok: true, ...out });
}
