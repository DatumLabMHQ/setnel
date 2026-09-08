import { loadReserves, reserveKey } from './_aave.mjs';
export async function evaluate({ sql, today, params, lib }) {
  const { usd, pp, num, dayStr, handlesFor, signal, series } = lib;
  const rows = await loadReserves({ sql, today, days: 2 });
  const out = [];
  for (const s of Object.values(series(rows, reserveKey))) {
    if (s.length < 2) continue;
    const cur = s[s.length - 1], prev = s[s.length - 2];
    if (cur.supply_apy == null || prev.supply_apy == null) continue;
    const d = num(cur.supply_apy) - num(prev.supply_apy);
    if (Math.abs(d) < params.min_move_pp) continue;
    out.push(signal({
      rule: 'aave_rate_move', product: 'aave', subject: `${cur.version}:${cur.chain_id}:${cur.market_key}:${cur.symbol}`, day: dayStr(cur.day),
      headline: `${cur.symbol} supply APY on Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) moved ${pp(d)} in a day`,
      angle: `${num(prev.supply_apy).toFixed(2)}% to ${num(cur.supply_apy).toFixed(2)}% on a ${usd(num(cur.supply_usd))} reserve. Rate moves that size on a reserve that size are rare.`,
      draft: `Suppliers of ${cur.symbol} on Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) are earning ${num(cur.supply_apy).toFixed(2)}% today against ${num(prev.supply_apy).toFixed(2)}% yesterday, a ${pp(d)} move on ${usd(num(cur.supply_usd))} of supply. Utilization is ${cur.utilization == null ? 'not reported at spoke level' : num(cur.utilization).toFixed(1) + '%'}.`,
      handles: handlesFor('aave'), numbers: { supply_apy_before: num(prev.supply_apy), supply_apy_after: num(cur.supply_apy), supply_usd: num(cur.supply_usd) }, source: 'aave.fct_aave_reserve_daily',
      gate: { now_usd: num(cur.supply_usd), prior_usd: num(prev.supply_usd) },
    }));
  }
  return out;
}
