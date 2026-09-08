export async function evaluate({ sql, today, params, lib }) {
  const { usd, pct, num, dayStr, handlesFor, signal, series } = lib;
  const rows = await sql`
    select day, version, chain_id, chain_name, market_name, market_key, supply_usd, borrow_usd from aave.fct_aave_market_daily
    where day between ${today}::date - 2 and ${today}::date order by version, chain_id, market_key, day`;
  const out = [];
  for (const s of Object.values(series(rows, (r) => `${r.version}|${r.chain_id}|${r.market_key}`))) {
    if (s.length < 2) continue;
    const cur = s[s.length - 1], prev = s[s.length - 2];
    if (!(num(prev.supply_usd) > 0)) continue;
    const delta = num(cur.supply_usd) - num(prev.supply_usd); const p = (delta / num(prev.supply_usd)) * 100;
    if (Math.abs(p) < params.min_pct || Math.abs(delta) < params.min_delta_usd) continue;
    out.push(signal({
      rule: 'aave_market_move', product: 'aave', subject: `${cur.version}:${cur.chain_id}:${cur.market_key}`, day: dayStr(cur.day),
      headline: `Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) supply ${pct(p)} in a day to ${usd(num(cur.supply_usd))}`,
      angle: `${usd(Math.abs(delta))} ${delta >= 0 ? 'came in' : 'left'} in 24 hours; borrows sit at ${usd(num(cur.borrow_usd))}.`,
      draft: `Total supplied on Aave ${cur.version} ${cur.market_name} (${cur.chain_name}) moved from ${usd(num(prev.supply_usd))} to ${usd(num(cur.supply_usd))} in a day (${pct(p)}), with borrows at ${usd(num(cur.borrow_usd))}. Reserve-level data shows which asset carried it; that is the follow-up.`,
      handles: handlesFor('aave'), numbers: { supply_before: num(prev.supply_usd), supply_after: num(cur.supply_usd), delta_usd: delta, borrow_usd: num(cur.borrow_usd) }, source: 'aave.fct_aave_market_daily',
      gate: { now_usd: num(cur.supply_usd), prior_usd: num(prev.supply_usd) },
    }));
  }
  return out;
}
