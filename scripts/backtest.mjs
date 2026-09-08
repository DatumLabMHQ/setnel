// Replay a rule over the platform's history so a threshold is chosen from evidence, not guesswork.
//
//   node scripts/backtest.mjs --rule tvl_wow --since 2025-09-01 [--until 2026-09-08] [--set pct_large=3 --set min_usd=50e6]
//
// Runs the rule's module once per day as of that day (the same code the engine runs), applies the shared
// noise gates, simulates the rule's cooldown per fingerprint, and prints fires per month plus the largest
// ten. --set overrides a param (or a gate when the key is min_usd / nonzero_prior / min_units_pct).
// Needs PLATFORM_DATABASE_URL (read-only).

import { neon } from '@neondatabase/serverless';
import { loadManifest, runRule } from './rules/engine.mjs';
import { addDays } from './rules/lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const id = opt('--rule'); const since = opt('--since'); const until = opt('--until', new Date().toISOString().slice(0, 10));
if (!id || !since) { console.error('usage: --rule <id> --since YYYY-MM-DD [--until YYYY-MM-DD] [--set k=v]...'); process.exit(1); }
if (!process.env.PLATFORM_DATABASE_URL) { console.error('PLATFORM_DATABASE_URL not set'); process.exit(1); }
const sets = {}; args.forEach((a, i) => { if (a === '--set') { const [k, v] = args[i + 1].split('='); sets[k] = Number.isFinite(Number(v)) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v; } });

const rule = loadManifest().find((r) => r.id === id);
if (!rule) { console.error(`no rule ${id} in rules/`); process.exit(1); }
const GATE_KEYS = ['min_usd', 'nonzero_prior', 'min_units_pct'];
for (const [k, v] of Object.entries(sets)) { if (GATE_KEYS.includes(k)) rule.gates[k] = v; else rule.params[k] = v; }

const sql = neon(process.env.PLATFORM_DATABASE_URL);
const cool = new Map(); const fires = []; let gated = 0, days = 0;
for (let day = since; day <= until; day = addDays(day, 1)) {
  days += 1;
  const { kept, dropped } = await runRule(rule, { sql, today: day });
  gated += dropped.length;
  for (const ev of kept) {
    const last = cool.get(ev.fingerprint);
    const t = new Date(day + 'T00:00:00Z').getTime();
    if (last != null && t - last < rule.cooldown_hours * 3600e3) continue;   // still cooling down
    cool.set(ev.fingerprint, t); fires.push({ day, ...ev });
  }
}
const byMonth = {}; for (const f of fires) byMonth[f.day.slice(0, 7)] = (byMonth[f.day.slice(0, 7)] ?? 0) + 1;
const size = (f) => Math.max(...Object.values(f.payload.numbers ?? {}).filter((v) => typeof v === 'number').map(Math.abs), 0);
console.log(JSON.stringify({ rule: id, since, until, days, params: rule.params, gates: rule.gates, cooldown_hours: rule.cooldown_hours, fires: fires.length, per_day: Number((fires.length / days).toFixed(3)), dropped_by_gates: gated, by_month: byMonth }, null, 2));
console.log('\nLargest ten:');
for (const f of [...fires].sort((a, b) => size(b) - size(a)).slice(0, 10)) console.log(`  ${f.day}  [${f.severity}] ${f.message}`);
