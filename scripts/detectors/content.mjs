// Setnel — content-signal detectors over the Datum data platform.
//
// Reads the platform's curated tables (read-only URL) and posts category 'signal' events to the
// Hub: a headline, an angle, a paste-ready draft, the handles to tag and the numbers behind it.
// Signals never open incidents and never page; the Hub's Content page and /api/v1/signals show
// them. Runs daily after the platform's 00:xx full sweep (workflow setnel-content), or by hand:
//
//   PLATFORM_DATABASE_URL=... SETNEL_DASHBOARD_SECRET_PLATFORM=... node scripts/detectors/content.mjs [--dry-run] [--days N]
//
// Rules (Joel's tweet-worthy rule engine, ported where the platform has the data, plus Datum's own):
//   net_flow_24h            DefiLlama Ethereum TVL 24h change beyond $500M (notable) / $2B (major) for the tracked lending set
//   tvl_wow                 total TVL moved >= 2% week over week at $1B+, >= 5% below that (SparkLend digest rule, widened)
//   utilization_rate_kink   Aave v3 USDC/USDT crossed 90% or 95% utilization since the previous day
//   morpho_curator_hhi      curator concentration crossed 2500/3000, moved > 100 points in 7 days, or top-3 share moved > 1pp in a day
//   morpho_top_curator      the largest curator changed, or the leader's share moved >= 2pp in a day
//   morpho_vault_move       a listed vault's TVL moved >= 15% and >= $20M in a day
//   aave_market_move        an Aave v3 market's supply moved >= 5% and >= $50M in a day; v4 hub weekly
//   aave_rate_move          a reserve over $100M saw supply APY move >= 2pp in a day
//   centrifuge_flow         a token's net flow over $5M in a day, or a pool set a 90-day TVL high
//   sui_tvl_move            a Sui protocol's net TVL moved >= 8% in a day
//   rwa_aum_move            tokenized-RWA AUM on Horizon moved >= 3% in a day
//   liquidation_day         a Sui protocol liquidated more than $1M of debt in a day
// Not ported yet (needs data the platform does not hold): real_yield_spread_regime (T-bill rate),
// apy_dispersion_blowout and liquidity_normalization (30-day platform baselines; revisit in October).

import { createHmac } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const HUB = process.env.SETNEL_HUB_URL || 'https://setnel.datumlab.xyz';
const SECRET = process.env.SETNEL_DASHBOARD_SECRET_PLATFORM;
const DB = process.env.PLATFORM_DATABASE_URL;
const DASHBOARD_ID = 'platform';
const DRY = process.argv.includes('--dry-run');
const argDays = process.argv.indexOf('--days');
const LOOKBACK_DAYS = argDays > -1 ? Number(process.argv[argDays + 1]) : 1;

const HANDLES = {
  'morpho-blue': '@MorphoLabs', morpho: '@MorphoLabs', 'aave-v3': '@aave', 'aave-v2': '@aave', 'aave-v4': '@aave', aave: '@aave',
  sparklend: '@sparkdotfi', 'compound-v3': '@compoundfinance', 'compound-v2': '@compoundfinance', 'fluid-lending': '@0xfluid',
  'euler-v2': '@eulerfinance', 'moonwell-lending': '@MoonwellDeFi', 'sky-lending': '@SkyEcosystem', 'liquity-v1': '@LiquityProtocol', 'liquity-v2': '@LiquityProtocol',
  centrifuge: '@centrifuge', navi: '@navi_protocol', suilend: '@suilend', scallop: '@Scallop_io', alphalend: '@AlphaFiSUI', bucket: '@bucket_protocol',
  'Steakhouse Financial': '@SteakhouseFi', Gauntlet: '@gauntlet_xyz', SparkDAO: '@sparkdotfi', 'Sky Money': '@SkyEcosystem', Yearn: '@yearn', Sentora: '@Sentora_xyz',
  'Janus Henderson': '@JHIAdvisors', Anemoy: '@AnemoyCapital', horizon: '@aave', maple: '@maplefinance', superstate: '@superstatefunds', 'ondo-finance': '@OndoFinance',
};
const handlesFor = (...keys) => [...new Set(keys.map((k) => HANDLES[k]).filter(Boolean))];

const usd = (n) => { const a = Math.abs(n); const s = n < 0 ? '-' : ''; if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`; if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`; return `${s}$${a.toFixed(0)}`; };
const pct = (x, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;
const pp = (x, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}pp`;
const num = (v) => (v == null ? null : Number(v));
// neon returns date columns as Date objects or ISO strings depending on the driver path; normalise to YYYY-MM-DD.
const dayStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const title = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function signal({ rule, product, subject, day, headline, angle, draft, handles, numbers, source }) {
  return {
    detectorId: `content.${rule}`, category: 'signal', severity: 'info', message: headline,
    fingerprint: `signal:${rule}:${subject}:${day}`, linkPath: '/',
    payload: { rule, product, day: String(day), angle, draft, handles, numbers, source },
  };
}

async function main() {
  if (!DB) { console.error('PLATFORM_DATABASE_URL not set'); process.exit(1); }
  if (!DRY && !SECRET) { console.error('SETNEL_DASHBOARD_SECRET_PLATFORM not set'); process.exit(1); }
  const sql = neon(DB);
  const out = [];
  const ran = [];

  // ---------- DefiLlama-based rules (ref layer): net_flow_24h, tvl_wow ----------
  ran.push('net_flow_24h', 'tvl_wow');
  const llama = await sql`
    with latest as (
      select distinct on (slug, chain, day) slug, chain, day, tvl_usd from ref.raw_defillama_tvl
      where day >= current_date - 9 order by slug, chain, day, fetched_at desc
    )
    select slug, chain, day, tvl_usd from latest order by slug, chain, day`;
  const bySlug = {};
  for (const r of llama) {
    const s = (bySlug[r.slug] ??= { eth: {}, total: {} });
    const d = dayStr(r.day);
    if (r.chain === 'ethereum') s.eth[d] = num(r.tvl_usd);
    s.total[d] = (s.total[d] ?? 0) + num(r.tvl_usd);
  }
  const NET_FLOW_SET = ['aave-v3', 'sparklend', 'morpho-blue', 'fluid-lending', 'compound-v3', 'euler-v2'];
  for (const [slug, s] of Object.entries(bySlug)) {
    const days = Object.keys(s.total).sort();
    if (days.length < 2) continue;
    const d0 = days[days.length - 1], d1 = days[days.length - 2], d7 = days.find((d) => d <= addDays(d0, -7)) ?? days[0];
    // Joel's net_flow_24h: Ethereum TVL day change beyond thresholds.
    if (NET_FLOW_SET.includes(slug) && s.eth[d0] != null && s.eth[d1] != null) {
      const delta = s.eth[d0] - s.eth[d1];
      if (Math.abs(delta) >= 500e6) {
        const major = Math.abs(delta) >= 2e9; const dir = delta >= 0 ? 'inflow' : 'outflow';
        out.push(signal({
          rule: 'net_flow_24h', product: slug, subject: slug, day: d0,
          headline: `${title(slug)} saw a ${usd(Math.abs(delta))} Ethereum ${dir} in a day${major ? ' (major)' : ''}`,
          angle: `${major ? 'Major' : 'Notable'} 24h ${dir} on Ethereum: ${usd(s.eth[d1])} to ${usd(s.eth[d0])} (${pct((delta / s.eth[d1]) * 100)}).`,
          draft: `${title(slug)} Ethereum TVL moved from ${usd(s.eth[d1])} to ${usd(s.eth[d0])} between ${d1} and ${d0}, a ${usd(Math.abs(delta))} ${dir} in 24 hours. ${major ? 'That is above the $2B line we treat as a regime-level move.' : 'That clears the $500M line we treat as worth a note.'} Source: DefiLlama, reconciled against the platform.`,
          handles: handlesFor(slug), numbers: { tvl_before: s.eth[d1], tvl_after: s.eth[d0], delta_usd: delta }, source: 'ref.raw_defillama_tvl',
        }));
      }
    }
    // SparkLend digest rule: >= 2% week over week on total TVL.
    if (s.total[d0] != null && s.total[d7] != null && d7 !== d0 && s.total[d7] > 0) {
      const wow = ((s.total[d0] - s.total[d7]) / s.total[d7]) * 100;
      // 2% moves matter at $1B+; below that ask for 5% so the queue is not a list of small protocols.
      const wowLine = s.total[d0] >= 1e9 ? 2 : 5;
      if (Math.abs(wow) >= wowLine && s.total[d0] >= 100e6) {
        out.push(signal({
          rule: 'tvl_wow', product: slug, subject: slug, day: d0,
          headline: `${title(slug)} TVL ${pct(wow)} week over week to ${usd(s.total[d0])}`,
          angle: `${wow >= 0 ? 'Growth' : 'Drawdown'} narrative: ${usd(s.total[d7])} on ${d7} to ${usd(s.total[d0])} on ${d0}, all chains.`,
          draft: `${title(slug)} closed the week at ${usd(s.total[d0])} TVL across all chains, ${pct(wow)} versus ${usd(s.total[d7])} seven days earlier. ${wow >= 0 ? 'Worth asking which chain and which asset carried it.' : 'Worth asking whether it is rates, a single large exit, or a chain-level move.'}`,
          handles: handlesFor(slug), numbers: { tvl_week_ago: s.total[d7], tvl_now: s.total[d0], wow_pct: Number(wow.toFixed(2)) }, source: 'ref.raw_defillama_tvl',
        }));
      }
    }
  }

  // ---------- Aave: utilization_rate_kink, aave_market_move, aave_rate_move ----------
  ran.push('utilization_rate_kink', 'aave_market_move', 'aave_rate_move');
  const aaveRes = await sql`
    select day, version, chain_id, chain_name, market_name, market_key, symbol, supply_usd, borrow_usd, supply_apy, utilization
    from aave.fct_aave_reserve_daily where day >= current_date - 8 order by version, chain_id, market_key, symbol, day`;
  const resKey = (r) => `${r.version}|${r.chain_id}|${r.market_key}|${r.symbol}`;
  const resSeries = {};
  for (const r of aaveRes) (resSeries[resKey(r)] ??= []).push(r);
  for (const rows of Object.values(resSeries)) {
    if (rows.length < 2) continue;
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    const day = dayStr(cur.day);
    if (cur.version === 'v3' && ['USDC', 'USDT'].includes(cur.symbol) && cur.utilization != null && prev.utilization != null) {
      for (const t of [95, 90]) {
        if (num(prev.utilization) < t && num(cur.utilization) >= t) {
          out.push(signal({
            rule: 'utilization_rate_kink', product: 'aave', subject: `${cur.chain_name}-${cur.market_name}-${cur.symbol}-${t}`, day,
            headline: `${cur.symbol} on ${cur.market_name} (${cur.chain_name}) crossed ${t}% utilization`,
            angle: `${num(prev.utilization).toFixed(1)}% to ${num(cur.utilization).toFixed(1)}% in a day on ${usd(num(cur.supply_usd))} of supply. Borrow rates kink above the optimal point.`,
            draft: `${cur.symbol} utilization on Aave v3 ${cur.market_name} (${cur.chain_name}) went from ${num(prev.utilization).toFixed(1)}% to ${num(cur.utilization).toFixed(1)}% between yesterday and today, past the ${t}% line, on ${usd(num(cur.supply_usd))} of supply. Above the kink every extra dollar borrowed moves rates fast, so the next few hours of supply APY (${num(cur.supply_apy).toFixed(2)}% now) are the thing to watch.`,
            handles: handlesFor('aave'), numbers: { utilization_before: num(prev.utilization), utilization_after: num(cur.utilization), supply_usd: num(cur.supply_usd), supply_apy: num(cur.supply_apy) }, source: 'aave.fct_aave_reserve_daily',
          }));
          break;
        }
      }
    }
    if (num(cur.supply_usd) >= 100e6 && cur.supply_apy != null && prev.supply_apy != null) {
      const d = num(cur.supply_apy) - num(prev.supply_apy);
      if (Math.abs(d) >= 2) {
        out.push(signal({
          rule: 'aave_rate_move', product: 'aave', subject: `${cur.version}-${cur.chain_id}-${cur.market_key}-${cur.symbol}`, day,
          headline: `${cur.symbol} supply APY on Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) moved ${pp(d)} in a day`,
          angle: `${num(prev.supply_apy).toFixed(2)}% to ${num(cur.supply_apy).toFixed(2)}% on a ${usd(num(cur.supply_usd))} reserve. Rate moves that size on a reserve that size are rare.`,
          draft: `Suppliers of ${cur.symbol} on Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) are earning ${num(cur.supply_apy).toFixed(2)}% today against ${num(prev.supply_apy).toFixed(2)}% yesterday, a ${pp(d)} move on ${usd(num(cur.supply_usd))} of supply. Utilization is ${cur.utilization == null ? 'not reported at spoke level' : num(cur.utilization).toFixed(1) + '%'}.`,
          handles: handlesFor('aave'), numbers: { supply_apy_before: num(prev.supply_apy), supply_apy_after: num(cur.supply_apy), supply_usd: num(cur.supply_usd) }, source: 'aave.fct_aave_reserve_daily',
        }));
      }
    }
  }
  const aaveMk = await sql`
    select day, version, chain_id, chain_name, market_name, market_key, supply_usd, borrow_usd from aave.fct_aave_market_daily
    where day >= current_date - 8 order by version, chain_id, market_key, day`;
  const mkSeries = {};
  for (const r of aaveMk) (mkSeries[`${r.version}|${r.chain_id}|${r.market_key}`] ??= []).push(r);
  for (const rows of Object.values(mkSeries)) {
    if (rows.length < 2) continue;
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    const delta = num(cur.supply_usd) - num(prev.supply_usd); const p = (delta / num(prev.supply_usd)) * 100;
    if (Math.abs(p) >= 5 && Math.abs(delta) >= 50e6) {
      const day = dayStr(cur.day);
      out.push(signal({
        rule: 'aave_market_move', product: 'aave', subject: `${cur.version}-${cur.chain_id}-${cur.market_key}`, day,
        headline: `Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) supply ${pct(p)} in a day to ${usd(num(cur.supply_usd))}`,
        angle: `${usd(Math.abs(delta))} ${delta >= 0 ? 'came in' : 'left'} in 24 hours; borrows sit at ${usd(num(cur.borrow_usd))}.`,
        draft: `Total supplied on Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) moved from ${usd(num(prev.supply_usd))} to ${usd(num(cur.supply_usd))} in a day (${pct(p)}), with borrows at ${usd(num(cur.borrow_usd))}. Reserve-level data shows which asset carried it; that is the follow-up.`,
        handles: handlesFor('aave'), numbers: { supply_before: num(prev.supply_usd), supply_after: num(cur.supply_usd), delta_usd: delta, borrow_usd: num(cur.borrow_usd) }, source: 'aave.fct_aave_market_daily',
      }));
    }
  }

  // ---------- Morpho: morpho_curator_hhi, morpho_top_curator, morpho_vault_move ----------
  ran.push('morpho_curator_hhi', 'morpho_top_curator', 'morpho_vault_move');
  const cur8 = await sql`select day, curator, tvl_usd, share_of_vault_tvl from morpho.fct_morpho_curator_daily where day >= current_date - 8 order by day, tvl_usd desc`;
  const byDay = {};
  for (const r of cur8) (byDay[dayStr(r.day)] ??= []).push(r);
  const cdays = Object.keys(byDay).sort();
  if (cdays.length >= 2) {
    const d0 = cdays[cdays.length - 1], d1 = cdays[cdays.length - 2], d7 = cdays.find((d) => d <= addDays(d0, -7)) ?? cdays[0];
    const hhi = (rows) => rows.reduce((a, r) => a + Math.pow(num(r.share_of_vault_tvl) * 100, 2), 0);
    const top3 = (rows) => rows.slice(0, 3).reduce((a, r) => a + num(r.share_of_vault_tvl) * 100, 0);
    const h0 = hhi(byDay[d0]), h1 = hhi(byDay[d1]), h7 = hhi(byDay[d7]);
    const t0 = top3(byDay[d0]), t1 = top3(byDay[d1]);
    const reasons = [];
    for (const line of [2500, 3000]) { if (h1 < line && h0 >= line) reasons.push(`crossed ${line}`); if (h1 >= line && h0 < line) reasons.push(`fell back below ${line}`); }
    if (d7 !== d0 && Math.abs(h0 - h7) > 100) reasons.push(`moved ${h0 - h7 >= 0 ? '+' : ''}${(h0 - h7).toFixed(0)} points in 7 days`);
    if (Math.abs(t0 - t1) > 1) reasons.push(`top-3 share moved ${pp(t0 - t1)} in a day`);
    if (reasons.length) {
      const lead = byDay[d0].slice(0, 3);
      out.push(signal({
        rule: 'morpho_curator_hhi', product: 'morpho', subject: 'curators', day: d0,
        headline: `Morpho curator concentration (HHI ${h0.toFixed(0)}) ${reasons[0]}`,
        angle: `${reasons.join('; ')}. Top three: ${lead.map((r) => `${r.curator} ${(num(r.share_of_vault_tvl) * 100).toFixed(1)}%`).join(', ')}.`,
        draft: `Curator concentration on Morpho vaults (V1 and V2, listed only) reads HHI ${h0.toFixed(0)} today${d7 !== d0 ? ` versus ${h7.toFixed(0)} a week ago` : ''}. ${lead.map((r) => `${r.curator} runs ${usd(num(r.tvl_usd))} (${(num(r.share_of_vault_tvl) * 100).toFixed(1)}%)`).join(', ')}. Above 2500 is the line regulators call highly concentrated; the question for Morpho is whether that is a feature of early curation or a risk.`,
        handles: handlesFor('morpho', ...lead.map((r) => r.curator)), numbers: { hhi: Number(h0.toFixed(0)), hhi_week_ago: Number(h7.toFixed(0)), top3_share_pct: Number(t0.toFixed(1)) }, source: 'morpho.fct_morpho_curator_daily',
      }));
    }
    const a = byDay[d0][0], b = byDay[d1][0];
    const leadShift = (num(a.share_of_vault_tvl) - num(b.share_of_vault_tvl)) * 100;
    if (a && b && (a.curator !== b.curator || Math.abs(leadShift) >= 2)) {
      out.push(signal({
        rule: 'morpho_top_curator', product: 'morpho', subject: a.curator, day: d0,
        headline: a.curator !== b.curator ? `${a.curator} is now the largest Morpho curator, overtaking ${b.curator}` : `${a.curator}'s share of Morpho vault TVL moved ${pp(leadShift)} in a day`,
        angle: `${a.curator} ${usd(num(a.tvl_usd))} (${(num(a.share_of_vault_tvl) * 100).toFixed(1)}%)${a.curator !== b.curator ? ` vs ${b.curator} the day before` : ''}.`,
        draft: a.curator !== b.curator
          ? `${a.curator} now curates ${usd(num(a.tvl_usd))} across Morpho vaults, ${(num(a.share_of_vault_tvl) * 100).toFixed(1)}% of listed vault TVL, and has overtaken ${b.curator} as the largest curator. Counting Vault V2 is what changes this picture; V1-only views still show the old leader.`
          : `${a.curator}'s share of listed Morpho vault TVL moved ${pp(leadShift)} in a day to ${(num(a.share_of_vault_tvl) * 100).toFixed(1)}% (${usd(num(a.tvl_usd))}).`,
        handles: handlesFor('morpho', a.curator, b.curator), numbers: { tvl_usd: num(a.tvl_usd), share_pct: Number((num(a.share_of_vault_tvl) * 100).toFixed(1)), share_shift_pp: Number(leadShift.toFixed(1)) }, source: 'morpho.fct_morpho_curator_daily',
      }));
    }
  }
  const vaults = await sql`
    select day, chain_id, vault_address, name, curator, total_assets_usd from morpho.fct_morpho_vault_daily
    where listed and day >= current_date - 3 order by chain_id, vault_address, day`;
  const vs = {};
  for (const r of vaults) (vs[`${r.chain_id}|${r.vault_address}`] ??= []).push(r);
  for (const rows of Object.values(vs)) {
    if (rows.length < 2) continue;
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    const delta = num(cur.total_assets_usd) - num(prev.total_assets_usd); const p = num(prev.total_assets_usd) > 0 ? (delta / num(prev.total_assets_usd)) * 100 : 0;
    if (Math.abs(p) >= 15 && Math.abs(delta) >= 20e6) {
      const day = dayStr(cur.day);
      out.push(signal({
        rule: 'morpho_vault_move', product: 'morpho', subject: `${cur.chain_id}-${cur.vault_address}`, day,
        headline: `${cur.name} (${cur.curator}) ${delta >= 0 ? 'grew' : 'shrank'} ${pct(p)} in a day to ${usd(num(cur.total_assets_usd))}`,
        angle: `${usd(Math.abs(delta))} ${delta >= 0 ? 'in' : 'out'} of one vault in 24 hours.`,
        draft: `${cur.name}, curated by ${cur.curator}, went from ${usd(num(prev.total_assets_usd))} to ${usd(num(cur.total_assets_usd))} in a day (${pct(p)}). Moves this size in a single vault usually mean one allocator; the deposit and withdrawal events name them.`,
        handles: handlesFor('morpho', cur.curator), numbers: { tvl_before: num(prev.total_assets_usd), tvl_after: num(cur.total_assets_usd), delta_usd: delta }, source: 'morpho.fct_morpho_vault_daily',
      }));
    }
  }

  // ---------- Centrifuge: centrifuge_flow ----------
  ran.push('centrifuge_flow');
  const flows = await sql`select day, token_id, symbol, deposits_usd, redemptions_usd, net_flow_usd from centrifuge.fct_centrifuge_flows_daily where day >= current_date - 2 order by day desc`;
  for (const f of flows) {
    if (Math.abs(num(f.net_flow_usd)) >= 5e6) {
      const day = dayStr(f.day);
      out.push(signal({
        rule: 'centrifuge_flow', product: 'centrifuge', subject: f.symbol, day,
        headline: `${f.symbol} on Centrifuge saw ${usd(Math.abs(num(f.net_flow_usd)))} net ${num(f.net_flow_usd) >= 0 ? 'inflow' : 'outflow'} on ${day}`,
        angle: `Deposits ${usd(num(f.deposits_usd) || 0)}, redemptions ${usd(num(f.redemptions_usd) || 0)}.`,
        draft: `${f.symbol} took ${usd(num(f.deposits_usd) || 0)} of deposits against ${usd(num(f.redemptions_usd) || 0)} of redemptions on ${day}, a ${usd(Math.abs(num(f.net_flow_usd)))} net ${num(f.net_flow_usd) >= 0 ? 'inflow' : 'outflow'}. Executed and claimed investor transactions only; pending requests are not counted.`,
        handles: handlesFor('centrifuge', f.symbol.includes('J') ? 'Janus Henderson' : ''), numbers: { deposits_usd: num(f.deposits_usd), redemptions_usd: num(f.redemptions_usd), net_flow_usd: num(f.net_flow_usd) }, source: 'centrifuge.fct_centrifuge_flows_daily',
      }));
    }
  }
  const poolHigh = await sql`
    with p as (select day, pool_id, pool_name, tvl_usd from centrifuge.fct_centrifuge_pool_daily where day >= current_date - 90)
    select day, pool_id, pool_name, tvl_usd from p where day = (select max(day) from p) and tvl_usd >= 50e6
      and tvl_usd >= (select max(tvl_usd) from p q where q.pool_id = p.pool_id and q.day < p.day)`;
  for (const r of poolHigh) {
    const day = dayStr(r.day);
    out.push(signal({
      rule: 'centrifuge_flow', product: 'centrifuge', subject: `high-${r.pool_id}`, day,
      headline: `${r.pool_name} set a 90-day TVL high at ${usd(num(r.tvl_usd))}`,
      angle: 'Pool at a 90-day high. Pair with the day\'s net flow for the cause.',
      draft: `${r.pool_name} on Centrifuge closed ${day} at ${usd(num(r.tvl_usd))}, its highest level in 90 days. Token supply times price, checked against DefiLlama within 0.1%.`,
      handles: handlesFor('centrifuge', r.pool_name.includes('Janus') ? 'Janus Henderson' : r.pool_name.includes('Anemoy') ? 'Anemoy' : ''), numbers: { tvl_usd: num(r.tvl_usd) }, source: 'centrifuge.fct_centrifuge_pool_daily',
    }));
  }

  // ---------- Sui: sui_tvl_move, liquidation_day ----------
  ran.push('sui_tvl_move', 'liquidation_day');
  const sui = await sql`select day, protocol, tvl_net_usd from sui.fct_sui_protocol_tvl_daily where day >= current_date - 3 and tvl_net_usd is not null order by protocol, day`;
  const ss = {};
  for (const r of sui) (ss[r.protocol] ??= []).push(r);
  for (const [protocol, rows] of Object.entries(ss)) {
    if (rows.length < 2) continue;
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    const p = ((num(cur.tvl_net_usd) - num(prev.tvl_net_usd)) / num(prev.tvl_net_usd)) * 100;
    if (Math.abs(p) >= 8 && num(cur.tvl_net_usd) >= 5e6) {
      const day = dayStr(cur.day);
      out.push(signal({
        rule: 'sui_tvl_move', product: 'sui', subject: protocol, day,
        headline: `${title(protocol)} net TVL ${pct(p)} in a day to ${usd(num(cur.tvl_net_usd))}`,
        angle: `${usd(num(prev.tvl_net_usd))} to ${usd(num(cur.tvl_net_usd))} on Sui.`,
        draft: `${title(protocol)}'s net TVL on Sui (supplied minus borrowed, our own decode) moved from ${usd(num(prev.tvl_net_usd))} to ${usd(num(cur.tvl_net_usd))} in a day, ${pct(p)}. Pool-level rows show which asset moved.`,
        handles: handlesFor(protocol), numbers: { tvl_before: num(prev.tvl_net_usd), tvl_after: num(cur.tvl_net_usd), pct: Number(p.toFixed(2)) }, source: 'sui.fct_sui_protocol_tvl_daily',
      }));
    }
  }
  const liq = await sql`select day, protocol, count(*)::int as events, sum(debt_usd) as debt_usd, sum(collateral_usd) as collateral_usd from sui.fct_sui_liquidations where day >= current_date - 1 group by 1, 2 having sum(debt_usd) >= 1e6`;
  for (const r of liq) {
    const day = dayStr(r.day);
    out.push(signal({
      rule: 'liquidation_day', product: 'sui', subject: r.protocol, day,
      headline: `${title(r.protocol)} liquidated ${usd(num(r.debt_usd))} of debt on ${day} across ${r.events} events`,
      angle: `${usd(num(r.collateral_usd))} of collateral seized. Above the $1M/day line.`,
      draft: `${title(r.protocol)} on Sui saw ${r.events} liquidations on ${day} repaying ${usd(num(r.debt_usd))} of debt against ${usd(num(r.collateral_usd))} of seized collateral. Liquidator and gas figures per event are in the platform.`,
      handles: handlesFor(r.protocol), numbers: { events: r.events, debt_usd: num(r.debt_usd), collateral_usd: num(r.collateral_usd) }, source: 'sui.fct_sui_liquidations',
    }));
  }

  // ---------- RWA: rwa_aum_move ----------
  ran.push('rwa_aum_move');
  const rwa = await sql`select day, rwa_aum_usd, horizon_supplied_usd from rwa.fct_rwa_totals_daily where day >= current_date - 3 order by day`;
  if (rwa.length >= 2) {
    const cur = rwa[rwa.length - 1], prev = rwa[rwa.length - 2];
    const p = ((num(cur.rwa_aum_usd) - num(prev.rwa_aum_usd)) / num(prev.rwa_aum_usd)) * 100;
    if (Math.abs(p) >= 3) {
      const day = dayStr(cur.day);
      out.push(signal({
        rule: 'rwa_aum_move', product: 'rwa', subject: 'horizon', day,
        headline: `Tokenized-RWA AUM on Aave Horizon ${pct(p)} in a day to ${usd(num(cur.rwa_aum_usd))}`,
        angle: `${usd(num(prev.rwa_aum_usd))} to ${usd(num(cur.rwa_aum_usd))}; ${usd(num(cur.horizon_supplied_usd))} supplied on Horizon.`,
        draft: `RWA AUM tracked on the Horizon terminal moved from ${usd(num(prev.rwa_aum_usd))} to ${usd(num(cur.rwa_aum_usd))} in a day (${pct(p)}), with ${usd(num(cur.horizon_supplied_usd))} supplied into Horizon markets. Stablecoin reserves are excluded from this figure by design.`,
        handles: handlesFor('horizon'), numbers: { aum_before: num(prev.rwa_aum_usd), aum_after: num(cur.rwa_aum_usd), pct: Number(p.toFixed(2)) }, source: 'rwa.fct_rwa_totals_daily',
      }));
    }
  }

  if (DRY) {
    console.log(JSON.stringify({ dryRun: true, rules: ran, signals: out.length }, null, 0));
    for (const s of out) console.log(`\n[${s.payload.rule}] ${s.message}\n  angle: ${s.payload.angle}\n  tag: ${s.payload.handles.join(' ')}\n  ${s.payload.draft}`);
    return;
  }
  const hub = await post(out);
  console.log(JSON.stringify({ rules: ran.length, signals: out.length, hub }));
}

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

async function post(events) {
  const body = JSON.stringify({ dashboardId: DASHBOARD_ID, events, samples: [] });
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await fetch(`${HUB.replace(/\/$/, '')}/api/v1/events`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-setnel-signature': sig }, body,
  });
  return res.json().catch(() => ({ status: res.status }));
}

main().catch((e) => { console.error(e); process.exit(1); });
