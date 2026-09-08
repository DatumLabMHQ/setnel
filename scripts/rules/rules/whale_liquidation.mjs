// Joel's whale_liquidation, on the platform's Sui liquidation events today; Ethereum lending when that seed lands.
export async function evaluate({ sql, today, params, lib }) {
  const { usd, num, dayStr, title, handlesFor, signal } = lib;
  const rows = await sql`
    select event_id, protocol, tx_digest, ts, day, borrower, collateral_asset, collateral_usd, debt_asset, debt_usd, liquidator
    from sui.fct_sui_liquidations where day between ${today}::date - 1 and ${today}::date and collateral_usd >= ${params.min_collateral_usd} order by collateral_usd desc limit 20`;
  return rows.map((r) => {
    const critical = num(r.collateral_usd) >= params.critical_collateral_usd;
    return signal({
      rule: 'whale_liquidation', product: 'sui', subject: `${r.protocol}:${r.tx_digest}`, day: dayStr(r.day), severity: critical ? 'critical' : 'warning',
      headline: `${usd(num(r.collateral_usd))} of ${r.collateral_asset} liquidated in one ${title(r.protocol)} position${critical ? ' (major)' : ''}`,
      angle: `Single liquidation on Sui: ${usd(num(r.debt_usd))} of ${r.debt_asset} debt repaid, ${usd(num(r.collateral_usd))} of collateral seized.`,
      draft: `A single ${title(r.protocol)} position on Sui was liquidated on ${dayStr(r.day)}: ${usd(num(r.debt_usd))} of ${r.debt_asset} debt repaid against ${usd(num(r.collateral_usd))} of ${r.collateral_asset} seized. Transaction ${r.tx_digest.slice(0, 12)}… Borrower and liquidator addresses are in the platform.`,
      handles: handlesFor(r.protocol), numbers: { collateral_usd: num(r.collateral_usd), debt_usd: num(r.debt_usd) }, source: 'sui.fct_sui_liquidations',
    });
  });
}
