// Setnel — central detector runner for the Datum data platform (datum-models on Neon).
//
// The platform has no HTTP surface yet, so its detectors run here: read ops.* and the
// curated tables through the read connection, POST events + samples to the Hub. Same
// contract as scripts/detectors/rwa.mjs. Triggered by the setnel-platform workflow.
//
// Secrets: PLATFORM_DATABASE_URL (a read-only or owner Neon URL), SETNEL_DASHBOARD_SECRET_PLATFORM.

import { createHmac } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const HUB = process.env.SETNEL_HUB_URL || 'https://setnel.datumlab.xyz';
const SECRET = process.env.SETNEL_DASHBOARD_SECRET_PLATFORM;
const DB = process.env.PLATFORM_DATABASE_URL;
const DASHBOARD_ID = 'platform';
const BUILD_STALE_H = 2.5;   // hourly run; two misses = something is wrong

function fmtUsd(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

async function main() {
  if (!SECRET) { console.error('SETNEL_DASHBOARD_SECRET_PLATFORM not set'); process.exit(1); }
  if (!DB) { console.error('PLATFORM_DATABASE_URL not set'); process.exit(1); }
  const sql = neon(DB);
  const events = [];
  const samples = [];

  // 1) Latest run per job: any job whose latest run errored is an incident.
  const latest = await sql`
    select job, product, status, error, started_at, finished_at from (
      select distinct on (job) job, product, status, error, started_at, finished_at
      from ops.sync_runs order by job, run_id desc
    ) t order by job`;
  for (const r of latest) {
    if (r.status === 'error') {
      events.push({
        detectorId: 'platform.job-error', category: 'technical', severity: 'critical',
        message: `Platform job ${r.job} failed: ${String(r.error || '').slice(0, 200)}`,
        fingerprint: `platform.job-error:${r.job}`, linkPath: '/', payload: { job: r.job, product: r.product, error: r.error },
      });
    }
  }

  // 2) dbt build recency: the curated tables must be rebuilt every hour.
  const [build] = await sql`select max(finished_at) as last from ops.sync_runs where job = 'dbt.build' and status = 'ok'`;
  const buildAgeH = build?.last ? (Date.now() - new Date(build.last).getTime()) / 36e5 : 999;
  samples.push({ metricKey: 'platform.build_age_hours', value: buildAgeH });
  if (buildAgeH > BUILD_STALE_H) {
    events.push({
      detectorId: 'platform.build-stale', category: 'technical', severity: 'critical',
      message: `No successful dbt build for ${buildAgeH.toFixed(1)}h (expected hourly)`,
      fingerprint: 'platform.build-stale', linkPath: '/', payload: { buildAgeH },
    });
  }

  // 3) Source freshness: every registered source against its expected cadence.
  const fresh = await sql`
    select product, source_id, expected_hours, last_status,
           extract(epoch from now() - last_seen_at) / 3600 as age_h
    from ops.source_freshness order by product, source_id`;
  for (const f of fresh) {
    samples.push({ metricKey: `platform.${f.product}.${f.source_id}.age_hours`, value: Number(f.age_h) });
    if (f.last_status === 'broken' || Number(f.age_h) > Number(f.expected_hours)) {
      events.push({
        detectorId: 'platform.source-stale', category: 'technical', severity: 'warning',
        message: `Source ${f.product}/${f.source_id} is ${f.last_status} (last seen ${Number(f.age_h).toFixed(1)}h ago, expected within ${f.expected_hours}h)`,
        fingerprint: `platform.source-stale:${f.product}.${f.source_id}`, linkPath: '/', payload: { ...f },
      });
    }
  }

  // 4) Curated numbers as samples, so the Hub's adaptive baselines learn them and cross-checks can use them.
  const tvl = await sql`
    select protocol, tvl_net_usd, defillama_tvl_usd, divergence_vs_defillama from sui.fct_sui_protocol_tvl_daily
    where (protocol, day) in (select protocol, max(day) from sui.fct_sui_protocol_tvl_daily group by 1)`;
  for (const r of tvl) {
    samples.push({ metricKey: `platform.sui.${r.protocol}.tvl_net`, value: Number(r.tvl_net_usd) || 0 });
    const div = r.divergence_vs_defillama == null ? null : Number(r.divergence_vs_defillama);
    if (div != null && Math.abs(div) > 0.15) {
      events.push({
        detectorId: 'platform.reconciliation', category: 'technical', severity: 'warning',
        message: `${r.protocol} net TVL ${fmtUsd(Number(r.tvl_net_usd))} diverges ${(div * 100).toFixed(1)}% from DefiLlama ${fmtUsd(Number(r.defillama_tvl_usd))}`,
        fingerprint: `platform.reconciliation:sui.${r.protocol}`, linkPath: '/', payload: { ...r },
      });
    }
  }

  const hub = await post(events, samples);
  console.log(JSON.stringify({ ran: 4, events: events.length, samples: samples.length, hub }));
}

async function post(events, samples) {
  const body = JSON.stringify({ dashboardId: DASHBOARD_ID, events, samples });
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await fetch(`${HUB.replace(/\/$/, '')}/api/v1/events`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-setnel-signature': sig }, body,
  });
  return res.json().catch(() => ({ status: res.status }));
}

main().catch((e) => { console.error(e); process.exit(1); });
