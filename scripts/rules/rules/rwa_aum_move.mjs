export async function evaluate({ sql, today, params, lib }) {
  const { usd, pct, num, dayStr, handlesFor, signal } = lib;
  const rows = await sql`select day, rwa_aum_usd, horizon_supplied_usd from rwa.fct_rwa_totals_daily where day between ${today}::date - 2 and ${today}::date order by day`;
  if (rows.length < 2) return [];
  const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
  if (!(num(prev.rwa_aum_usd) > 0)) return [];
  const p = ((num(cur.rwa_aum_usd) - num(prev.rwa_aum_usd)) / num(prev.rwa_aum_usd)) * 100;
  if (Math.abs(p) < params.min_pct) return [];
  return [signal({
    rule: 'rwa_aum_move', product: 'rwa', subject: 'horizon', day: dayStr(cur.day),
    headline: `Tokenized-RWA AUM on Aave Horizon ${pct(p)} in a day to ${usd(num(cur.rwa_aum_usd))}`,
    angle: `${usd(num(prev.rwa_aum_usd))} to ${usd(num(cur.rwa_aum_usd))}; ${usd(num(cur.horizon_supplied_usd))} supplied on Horizon.`,
    draft: `RWA AUM tracked on the Horizon terminal moved from ${usd(num(prev.rwa_aum_usd))} to ${usd(num(cur.rwa_aum_usd))} in a day (${pct(p)}), with ${usd(num(cur.horizon_supplied_usd))} supplied into Horizon markets. Stablecoin reserves are excluded from this figure by design.`,
    handles: handlesFor('horizon'), numbers: { aum_before: num(prev.rwa_aum_usd), aum_after: num(cur.rwa_aum_usd), pct: Number(p.toFixed(2)) }, source: 'rwa.fct_rwa_totals_daily',
    gate: { now_usd: num(cur.rwa_aum_usd), prior_usd: num(prev.rwa_aum_usd) },
  })];
}
