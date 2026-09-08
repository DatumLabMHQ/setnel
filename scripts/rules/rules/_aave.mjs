export async function loadReserves({ sql, today, days }) {
  return sql`
    select day, version, chain_id, chain_name, market_name, market_key, symbol, supply_usd, borrow_usd, supply_apy, utilization, supply_amount, borrow_amount, price_usd
    from aave.fct_aave_reserve_daily where day between ${today}::date - (${days})::int and ${today}::date order by version, chain_id, market_key, symbol, day`;
}
export const reserveKey = (r) => `${r.version}|${r.chain_id}|${r.market_key}|${r.symbol}`;
