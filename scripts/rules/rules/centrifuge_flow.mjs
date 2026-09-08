export async function evaluate({ sql, today, params, lib }) {
  const { usd, num, dayStr, handlesFor, signal } = lib;
  const out = [];
  const flows = await sql`select day, token_id, symbol, deposits_usd, redemptions_usd, net_flow_usd from centrifuge.fct_centrifuge_flows_daily where day between ${today}::date - 1 and ${today}::date order by day desc`;
  for (const f of flows) {
    if (Math.abs(num(f.net_flow_usd)) < params.min_net_flow_usd) continue;
    const day = dayStr(f.day);
    out.push(signal({
      rule: 'centrifuge_flow', product: 'centrifuge', subject: `flow:${f.symbol}`, day,
      headline: `${f.symbol} on Centrifuge saw ${usd(Math.abs(num(f.net_flow_usd)))} net ${num(f.net_flow_usd) >= 0 ? 'inflow' : 'outflow'} on ${day}`,
      angle: `Deposits ${usd(num(f.deposits_usd) || 0)}, redemptions ${usd(num(f.redemptions_usd) || 0)}.`,
      draft: `${f.symbol} took ${usd(num(f.deposits_usd) || 0)} of deposits against ${usd(num(f.redemptions_usd) || 0)} of redemptions on ${day}, a ${usd(Math.abs(num(f.net_flow_usd)))} net ${num(f.net_flow_usd) >= 0 ? 'inflow' : 'outflow'}. Executed and claimed investor transactions only; pending requests are not counted.`,
      handles: handlesFor('centrifuge', f.symbol.includes('J') ? 'Janus Henderson' : ''), numbers: { deposits_usd: num(f.deposits_usd), redemptions_usd: num(f.redemptions_usd), net_flow_usd: num(f.net_flow_usd) }, source: 'centrifuge.fct_centrifuge_flows_daily',
    }));
  }
  const poolHigh = await sql`
    with p as (select day, pool_id, pool_name, tvl_usd from centrifuge.fct_centrifuge_pool_daily where day between ${today}::date - (${params.high_window_days})::int and ${today}::date)
    select day, pool_id, pool_name, tvl_usd from p where day = (select max(day) from p) and tvl_usd >= ${params.high_min_tvl_usd}
      and tvl_usd >= (select max(tvl_usd) from p q where q.pool_id = p.pool_id and q.day < p.day)`;
  for (const r of poolHigh) {
    const day = dayStr(r.day);
    out.push(signal({
      rule: 'centrifuge_flow', product: 'centrifuge', subject: `high:${r.pool_id}`, day,
      headline: `${r.pool_name} set a ${params.high_window_days}-day TVL high at ${usd(num(r.tvl_usd))}`,
      angle: `Pool at a ${params.high_window_days}-day high. Pair with the day's net flow for the cause.`,
      draft: `${r.pool_name} on Centrifuge closed ${day} at ${usd(num(r.tvl_usd))}, its highest level in ${params.high_window_days} days. Token supply times price, checked against DefiLlama within 0.1%.`,
      handles: handlesFor('centrifuge', r.pool_name.includes('Janus') ? 'Janus Henderson' : r.pool_name.includes('Anemoy') ? 'Anemoy' : ''), numbers: { tvl_usd: num(r.tvl_usd) }, source: 'centrifuge.fct_centrifuge_pool_daily',
    }));
  }
  return out;
}
