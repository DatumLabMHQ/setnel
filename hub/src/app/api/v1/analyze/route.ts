import { NextResponse } from 'next/server';
import { requireCronKey } from '@/lib/cron-auth';
import { runBaselines } from '@/lib/baseline';
import { runCompound } from '@/lib/compound';
import { runEscalations } from '@/lib/escalate';
import { recordHeartbeat } from '@/lib/admin';
import { checkAndPageStaleCrons } from '@/lib/selfcheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/analyze?key=<SETNEL_CRON_SECRET>
// Phase 3 analysis pass: adaptive baseline anomaly detection over the metric
// store, then compound/correlated rules over active incidents. Also records its
// heartbeat and runs the self-check (pages if any Setnel cron is stale).
export async function GET(req: Request) {
  const denied = requireCronKey(req);
  if (denied) return denied;
  const baseline = await runBaselines();
  const compound = await runCompound();
  const escalation = await runEscalations();
  await recordHeartbeat('analyze', `baseline ${baseline.anomalies} anomalies`);
  const selfcheck = await checkAndPageStaleCrons();
  return NextResponse.json({ ok: true, baseline, compound, escalation, selfcheck });
}
