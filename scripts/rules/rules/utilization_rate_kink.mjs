import { loadReserves, reserveKey } from './_aave.mjs';
export async function evaluate({ sql, today, params, lib }) {
  const { usd, num, dayStr, handlesFor, signal, series } = lib;
  const rows = await loadReserves({ sql, today, days: 2 });
  const out = [];
  for (const s of Object.values(series(rows, reserveKey))) {
    if (s.length < 2) continue;
    const cur = s[s.length - 1], prev = s[s.length - 2];
    if (cur.version !== 'v3' || !params.symbols.includes(cur.symbol) || cur.utilization == null || prev.utilization == null) continue;
    if (num(cur.supply_usd) < params.min_supply_usd) continue;
    for (const t of [...params.thresholds].sort((a, b) => b - a)) {   // per threshold: crossing 90 and 95 in one day fires both
      if (num(prev.utilization) < t && num(cur.utilization) >= t) {
        out.push(signal({
          rule: 'utilization_rate_kink', product: 'aave', subject: `${cur.chain_name}:${cur.market_name}:${cur.symbol}:${t}`, day: dayStr(cur.day), severity: t >= 95 ? 'warning' : 'info',
          headline: `${cur.symbol} on ${cur.market_name} (${cur.chain_name}) crossed ${t}% utilization`,
          angle: `${num(prev.utilization).toFixed(1)}% to ${num(cur.utilization).toFixed(1)}% in a day on ${usd(num(cur.supply_usd))} of supply. Borrow rates kink above the optimal point.`,
          draft: `${cur.symbol} utilization on Aave v3 ${cur.market_name} (${cur.chain_name}) went from ${num(prev.utilization).toFixed(1)}% to ${num(cur.utilization).toFixed(1)}% between yesterday and today, past the ${t}% line, on ${usd(num(cur.supply_usd))} of supply. Above the kink every extra dollar borrowed moves rates fast, so the next few hours of supply APY (${num(cur.supply_apy).toFixed(2)}% now) are the thing to watch.`,
          handles: handlesFor('aave'), numbers: { utilization_before: num(prev.utilization), utilization_after: num(cur.utilization), supply_usd: num(cur.supply_usd), supply_apy: num(cur.supply_apy) }, source: 'aave.fct_aave_reserve_daily',
        }));
      }
    }
  }
  return out;
}
