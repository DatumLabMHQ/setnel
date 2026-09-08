import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { dashboardSecret, verifySignature } from '@/lib/auth-hmac';
import { recordHeartbeat } from '@/lib/admin';
import { RuleManifestSchema } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/v1/rules  Body: { dashboardId, rules: [...], run? }  Header: x-setnel-signature (same HMAC as /api/v1/events)
// The engine posts the manifest after every run. Rules missing from the post are removed for that dashboard.
export async function POST(req: Request) {
  const raw = await req.text();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const result = RuleManifestSchema.safeParse(parsed);
  if (!result.success) return NextResponse.json({ error: 'invalid payload', detail: result.error.issues.slice(0, 5) }, { status: 400 });
  const { dashboardId, rules, run } = result.data;
  const secret = dashboardSecret(dashboardId);
  if (!secret) return NextResponse.json({ error: 'unknown dashboard' }, { status: 401 });
  if (!verifySignature(raw, req.headers.get('x-setnel-signature') ?? '', secret)) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const ran = new Set(run?.ran ?? []);
  for (const r of rules) {
    await sql`
      INSERT INTO rule_manifest (id, dashboard_id, owner, product, schedule, status, needs, description, severity, cooldown_hours, params, gates, source, last_ran_at, updated_at)
      VALUES (${r.id}, ${dashboardId}, ${r.owner}, ${r.product}, ${r.schedule}, ${r.status}, ${r.needs ?? null}, ${r.description}, ${r.severity}, ${r.cooldown_hours},
              ${JSON.stringify(r.params ?? {})}, ${JSON.stringify(r.gates ?? {})}, ${r.source ?? null}, ${ran.has(r.id) ? new Date().toISOString() : null}, now())
      ON CONFLICT (id) DO UPDATE SET dashboard_id = EXCLUDED.dashboard_id, owner = EXCLUDED.owner, product = EXCLUDED.product, schedule = EXCLUDED.schedule,
        status = EXCLUDED.status, needs = EXCLUDED.needs, description = EXCLUDED.description, severity = EXCLUDED.severity, cooldown_hours = EXCLUDED.cooldown_hours,
        params = EXCLUDED.params, gates = EXCLUDED.gates, source = EXCLUDED.source, last_ran_at = COALESCE(EXCLUDED.last_ran_at, rule_manifest.last_ran_at), updated_at = now()`;
  }
  const ids = rules.map((r) => r.id);
  await sql`DELETE FROM rule_manifest WHERE dashboard_id = ${dashboardId} AND NOT (id = ANY(${ids}))`;
  if (run) await recordHeartbeat(`rules-${run.schedule}`, `${run.ran.length} rules, ${run.signals} signals${run.errors.length ? `, ${run.errors.length} errors` : ''}`);
  return NextResponse.json({ ok: true, rules: rules.length });
}
