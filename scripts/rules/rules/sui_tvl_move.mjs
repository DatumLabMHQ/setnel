export async function evaluate({ sql, today, params, lib }) {
  const { usd, pct, num, dayStr, title, handlesFor, signal, series } = lib;
  const rows = await sql`select day, protocol, tvl_net_usd from sui.fct_sui_protocol_tvl_daily where day between ${today}::date - 2 and ${today}::date and tvl_net_usd is not null order by protocol, day`;
  const out = [];
  for (const [protocol, s] of Object.entries(series(rows, (r) => r.protocol))) {
    if (s.length < 2) continue;
    const cur = s[s.length - 1], prev = s[s.length - 2];
    if (!(num(prev.tvl_net_usd) > 0)) continue;
    const p = ((num(cur.tvl_net_usd) - num(prev.tvl_net_usd)) / num(prev.tvl_net_usd)) * 100;
    if (Math.abs(p) < params.min_pct) continue;
    out.push(signal({
      rule: 'sui_tvl_move', product: 'sui', subject: protocol, day: dayStr(cur.day),
      headline: `${title(protocol)} net TVL ${pct(p)} in a day to ${usd(num(cur.tvl_net_usd))}`,
      angle: `${usd(num(prev.tvl_net_usd))} to ${usd(num(cur.tvl_net_usd))} on Sui.`,
      draft: `${title(protocol)}'s net TVL on Sui (supplied minus borrowed, Datum's own decode) moved from ${usd(num(prev.tvl_net_usd))} to ${usd(num(cur.tvl_net_usd))} in a day, ${pct(p)}. Pool-level rows show which asset moved.`,
      handles: handlesFor(protocol), numbers: { tvl_before: num(prev.tvl_net_usd), tvl_after: num(cur.tvl_net_usd), pct: Number(p.toFixed(2)) }, source: 'sui.fct_sui_protocol_tvl_daily',
      gate: { now_usd: num(cur.tvl_net_usd), prior_usd: num(prev.tvl_net_usd) },
    }));
  }
  return out;
}
