// Setnel — central detector runner for RWA Terminal.
//
// RWA Terminal's backend is a Cloudflare Worker with a PUBLIC API, so its
// detectors run centrally here (fetch the public API → POST to the Hub) rather
// than from an in-dashboard cron route. Triggered by the setnel-rwa workflow.
//
// Plain Node (global fetch + node:crypto), no build. Signs the batch with the
// dashboard's shared secret, same contract as the in-repo runtime.

import { createHmac } from 'node:crypto';

const HUB = process.env.SETNEL_HUB_URL || 'https://setnel.datumlab.xyz';
const SECRET = process.env.SETNEL_DASHBOARD_SECRET_RWA;
const WORKER = process.env.RWA_WORKER_URL || 'https://rwa-terminal-worker.datumlabs.workers.dev';
const DASHBOARD_ID = 'rwa';

const STALE_H = 24;          // snapshot older than this = indexer/data stopped
const AUM_MAX = 20e9;        // rwa_aum above this = bad data (normal ~$5.5B)
const AUM_MIN = 0.5e9;       // ...or a collapse
const RECON_GAP_PCT = 5;     // dashboard's own DeFiLlama reconciliation gap
const DEPEG_PCT = 1;

const STABLES = new Set(['USDC', 'USDT', 'DAI', 'GHO', 'USDS', 'PYUSD', 'FRAX', 'RLUSD', 'USDe']);

function fmtUsd(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

async function main() {
  if (!SECRET) { console.error('SETNEL_DASHBOARD_SECRET_RWA not set'); process.exit(1); }

  let snap;
  try {
    const res = await fetch(`${WORKER}/api/snapshot`, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
    snap = await res.json();
  } catch (err) {
    // Can't reach the data source — that's itself a data-integrity signal.
    await post([{
      detectorId: 'rwa.data-source', category: 'technical', severity: 'critical',
      message: `RWA snapshot unreachable — ${err?.message || err}`, fingerprint: 'rwa.data-source', linkPath: '/', payload: {},
    }], []);
    console.log('snapshot unreachable — posted data-source alert');
    return;
  }

  const t = snap.totals ?? {};
  const events = [];
  const samples = [];

  // 1) Data freshness — fetched_at too old = the indexer/pipeline stopped.
  const ageH = (Date.now() / 1000 - (snap.fetched_at ?? 0)) / 3600;
  samples.push({ metricKey: 'rwa.data_age_hours', value: Math.max(0, ageH) });
  if (!snap.fetched_at || ageH > STALE_H) {
    events.push({
      detectorId: 'rwa.data-stale', category: 'technical', severity: 'critical',
      message: `RWA data is ${ageH.toFixed(0)}h old (snapshot ${snap.fetched_at ? new Date(snap.fetched_at * 1000).toISOString().slice(0, 10) : 'missing'}) — indexer may have stopped`,
      fingerprint: 'rwa.data-stale', linkPath: '/', payload: { ageHours: ageH, fetchedAt: snap.fetched_at },
    });
  }

  // 2) AUM sanity — rwa_aum wildly outside its normal band = bad data (the
  //    $40.65B-spike class). Also emitted as a sample so the Hub's adaptive
  //    anomaly detector learns the metric.
  const aum = Number(t.rwa_aum) || 0;
  samples.push({ metricKey: 'rwa.aum', value: aum });
  samples.push({ metricKey: 'rwa.total_aum', value: Number(t.total_aum) || 0 });
  samples.push({ metricKey: 'rwa.stablecoin_aum', value: Number(t.stablecoin_aum) || 0 });
  if (aum > AUM_MAX || (aum > 0 && aum < AUM_MIN)) {
    events.push({
      detectorId: 'rwa.aum-sanity', category: 'technical', severity: 'critical',
      message: `RWA AUM ${fmtUsd(aum)} is outside the sane band (${fmtUsd(AUM_MIN)}–${fmtUsd(AUM_MAX)}) — likely a bad data row`,
      fingerprint: 'rwa.aum-sanity', linkPath: '/', payload: { aum, exposureUsd: aum },
    });
  }

  // 3) Reconciliation — the dashboard's own cross-check vs DeFiLlama.
  const rec = t.reconciliation ?? {};
  if (rec.gap_pct != null) samples.push({ metricKey: 'rwa.reconciliation_gap_pct', value: Number(rec.gap_pct) });
  if ((rec.status && rec.status !== 'verified') || Math.abs(Number(rec.gap_pct) || 0) > RECON_GAP_PCT) {
    events.push({
      detectorId: 'rwa.reconciliation', category: 'technical', severity: 'warning',
      message: `RWA reconciliation ${rec.status ?? '?'} · ${rec.gap_pct}% gap vs ${rec.source ?? 'source'}`,
      fingerprint: 'rwa.reconciliation', linkPath: '/', payload: { ...rec },
    });
  }

  // 4) Stablecoin depeg among the reserves.
  for (const r of snap.reserves ?? []) {
    const sym = r.label || r.symbol_onchain;
    const price = Number(r.oracle_price_usd);
    if (!sym || r.asset_class !== 'Stablecoin' || !price || (r.supplied_usd ?? 0) < 1e6) continue;
    const devPct = (price - 1) * 100;
    if (Math.abs(devPct) > DEPEG_PCT) {
      events.push({
        detectorId: 'rwa.stablecoin-depeg', category: 'depegging', severity: 'critical',
        message: `${sym} at $${price.toFixed(4)} (${devPct > 0 ? '+' : ''}${devPct.toFixed(2)}% off peg)`,
        fingerprint: `rwa.depeg:${sym}`, linkPath: '/', payload: { symbol: sym, price, devPct, exposureUsd: r.supplied_usd },
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
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-setnel-signature': sig },
    body,
  });
  return res.json().catch(() => ({ status: res.status }));
}

main().catch((e) => { console.error(e); process.exit(1); });
