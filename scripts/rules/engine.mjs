// Setnel rules engine: manifest in, signals out.
//
//   node scripts/rules/engine.mjs --schedule hourly|daily|weekly|all [--rule <id>] [--dry-run] [--as-of YYYY-MM-DD]
//
// 1. Loads rules/*.yml (the manifest: thresholds, gates, cooldown, schedule, status, owner).
// 2. Runs each live rule's module (scripts/rules/rules/<id>.mjs) against the platform's curated tables.
// 3. Passes every event through the shared noise gates.
// 4. Posts the survivors to the hub (/api/v1/events), which applies the rule's cooldown per fingerprint,
//    emails warning-and-above signals at once, and folds the rest into the daily brief.
// 5. Posts the manifest itself to the hub (/api/v1/rules) so the Content page shows what can fire and why.
//
// Rule modules are pure: they read ctx.sql as of ctx.today and return events. That is what lets
// scripts/backtest.mjs replay any rule over the platform's history with different thresholds.

import { readdirSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { neon } from '@neondatabase/serverless';
import { passesNoiseGates } from './gates.mjs';
import * as lib from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RULES_DIR = path.resolve(HERE, '../../rules');
const HUB = process.env.SETNEL_HUB_URL || 'https://setnel.datumlab.xyz';
const SECRET = process.env.SETNEL_DASHBOARD_SECRET_PLATFORM;
const DB = process.env.PLATFORM_DATABASE_URL;
const DASHBOARD_ID = 'platform';

export function loadManifest() {
  return readdirSync(RULES_DIR).filter((f) => f.endsWith('.yml')).sort().map((f) => {
    const r = yaml.load(readFileSync(path.join(RULES_DIR, f), 'utf8'));
    if (!r?.id || r.id !== f.replace(/\.yml$/, '')) throw new Error(`rules/${f}: id must equal the file name`);
    for (const k of ['owner', 'product', 'schedule', 'status', 'description']) if (r[k] == null) throw new Error(`rules/${f}: missing ${k}`);
    if (!['hourly', 'daily', 'weekly'].includes(r.schedule)) throw new Error(`rules/${f}: schedule must be hourly, daily or weekly`);
    if (!['live', 'waiting', 'off'].includes(r.status)) throw new Error(`rules/${f}: status must be live, waiting or off`);
    return { cooldown_hours: 168, severity: 'info', params: {}, gates: {}, ...r };
  });
}

/** Run one rule as of a day and return its gated events (and the ones the gates dropped). */
export async function runRule(rule, { sql, today, params }) {
  const mod = await import(`./rules/${rule.id}.mjs`);
  const events = await mod.evaluate({ sql, today, params: { ...rule.params, ...(params ?? {}) }, rule, lib });
  const kept = [], dropped = [];
  for (const ev of events) {
    const g = passesNoiseGates(ev.payload?.gate, rule.gates);
    ev.cooldownHours = rule.cooldown_hours;
    if (g.ok) kept.push(ev); else dropped.push({ ev, reason: g.reason });
  }
  return { kept, dropped };
}

async function post(route, body) {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
  const res = await fetch(`${HUB.replace(/\/$/, '')}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-setnel-signature': sig }, body: raw });
  return res.json().catch(() => ({ status: res.status }));
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
  const schedule = opt('--schedule', 'all');
  const only = opt('--rule', null);
  const dry = args.includes('--dry-run');
  const today = opt('--as-of', new Date().toISOString().slice(0, 10));
  if (!DB) { console.error('PLATFORM_DATABASE_URL not set'); process.exit(1); }
  if (!dry && !SECRET) { console.error('SETNEL_DASHBOARD_SECRET_PLATFORM not set'); process.exit(1); }
  const sql = neon(DB);
  const manifest = loadManifest();
  const due = manifest.filter((r) => (only ? r.id === only : r.status === 'live' && (schedule === 'all' || r.schedule === schedule)));
  const out = [], ran = [], errors = [];
  for (const rule of due) {
    try {
      const { kept, dropped } = await runRule(rule, { sql, today });
      ran.push(rule.id); out.push(...kept);
      for (const d of dropped) console.log(`[gate] ${rule.id}: dropped "${d.ev.message}" (${d.reason})`);
    } catch (e) {
      errors.push({ rule: rule.id, error: String(e?.message ?? e) });
      console.error(`[error] ${rule.id}: ${e?.stack ?? e}`);   // one broken rule never blocks the others
    }
  }
  if (dry) {
    console.log(JSON.stringify({ dryRun: true, today, schedule, rules: ran, signals: out.length, errors }));
    for (const s of out) console.log(`\n[${s.payload.rule} · ${s.severity} · cooldown ${s.cooldownHours}h] ${s.message}\n  angle: ${s.payload.angle}\n  tag: ${s.payload.handles.join(' ')}\n  ${s.payload.draft}`);
    return;
  }
  const hub = out.length ? await post('/api/v1/events', { dashboardId: DASHBOARD_ID, events: out, samples: [] }) : { ok: true, stored: 0 };
  const manifestPost = await post('/api/v1/rules', {
    dashboardId: DASHBOARD_ID, rules: manifest.map((r) => ({ id: r.id, owner: r.owner, product: String(r.product), schedule: r.schedule, status: r.status, needs: r.needs ?? null, description: r.description, severity: r.severity, cooldown_hours: r.cooldown_hours, params: r.params, gates: r.gates, source: r.source ?? null })),
    run: { schedule, today, ran, signals: out.length, errors },
  });
  console.log(JSON.stringify({ today, schedule, rules: ran.length, signals: out.length, errors: errors.length, hub, manifest: manifestPost }));
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
