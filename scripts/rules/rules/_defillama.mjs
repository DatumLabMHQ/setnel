// Shared loader for the DefiLlama protocol TVL series in ref (change-only rows: take the latest fetch per day).
export async function loadDefillama({ sql, today, days }) {
  const rows = await sql`
    with latest as (
      select distinct on (slug, chain, day) slug, chain, day, tvl_usd from ref.raw_defillama_tvl
      where day between ${today}::date - (${days})::int and ${today}::date order by slug, chain, day, fetched_at desc
    )
    select slug, chain, day, tvl_usd from latest order by slug, chain, day`;
  const bySlug = {};
  for (const r of rows) {
    const s = (bySlug[r.slug] ??= { eth: {}, total: {} });
    const d = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    if (String(r.chain).toLowerCase() === 'ethereum') s.eth[d] = Number(r.tvl_usd);   // ref stores chain names lowercase
    s.total[d] = (s.total[d] ?? 0) + Number(r.tvl_usd);
  }
  return bySlug;
}
