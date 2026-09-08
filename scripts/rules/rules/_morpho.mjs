export async function loadCurators({ sql, today, days }) {
  const rows = await sql`select day, curator, tvl_usd, share_of_vault_tvl from morpho.fct_morpho_curator_daily where day between ${today}::date - (${days})::int and ${today}::date order by day, tvl_usd desc`;
  const byDay = {};
  for (const r of rows) { const d = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10); (byDay[d] ??= []).push(r); }
  return byDay;
}
