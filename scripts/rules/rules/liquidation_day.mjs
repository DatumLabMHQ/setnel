export async function evaluate({ sql, today, params, lib }) {
  const { usd, num, dayStr, title, handlesFor, signal } = lib;
  const rows = await sql`select day, protocol, count(*)::int as events, sum(debt_usd) as debt_usd, sum(collateral_usd) as collateral_usd from sui.fct_sui_liquidations where day between ${today}::date - 1 and ${today}::date group by 1, 2 having sum(debt_usd) >= ${params.min_debt_usd}`;
  return rows.map((r) => signal({
    rule: 'liquidation_day', product: 'sui', subject: `${r.protocol}:${dayStr(r.day)}`, day: dayStr(r.day),
    headline: `${title(r.protocol)} liquidated ${usd(num(r.debt_usd))} of debt on ${dayStr(r.day)} across ${r.events} events`,
    angle: `${usd(num(r.collateral_usd))} of collateral seized. Above the ${usd(params.min_debt_usd)}/day line.`,
    draft: `${title(r.protocol)} on Sui saw ${r.events} liquidations on ${dayStr(r.day)} repaying ${usd(num(r.debt_usd))} of debt against ${usd(num(r.collateral_usd))} of seized collateral. Liquidator and gas figures per event are in the platform.`,
    handles: handlesFor(r.protocol), numbers: { events: r.events, debt_usd: num(r.debt_usd), collateral_usd: num(r.collateral_usd) }, source: 'sui.fct_sui_liquidations',
  }));
}
