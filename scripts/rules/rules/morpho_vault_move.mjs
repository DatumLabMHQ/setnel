export async function evaluate({ sql, today, params, lib }) {
  const { usd, pct, num, dayStr, handlesFor, signal, series } = lib;
  const rows = await sql`
    select day, chain_id, vault_address, name, curator, total_assets_usd from morpho.fct_morpho_vault_daily
    where listed and day between ${today}::date - 2 and ${today}::date order by chain_id, vault_address, day`;
  const out = [];
  for (const s of Object.values(series(rows, (r) => `${r.chain_id}|${r.vault_address}`))) {
    if (s.length < 2) continue;
    const cur = s[s.length - 1], prev = s[s.length - 2];
    if (!(num(prev.total_assets_usd) > 0)) continue;
    const delta = num(cur.total_assets_usd) - num(prev.total_assets_usd); const p = (delta / num(prev.total_assets_usd)) * 100;
    if (Math.abs(p) < params.min_pct || Math.abs(delta) < params.min_delta_usd) continue;
    out.push(signal({
      rule: 'morpho_vault_move', product: 'morpho', subject: `${cur.chain_id}:${cur.vault_address}`, day: dayStr(cur.day),
      headline: `${cur.name} (${cur.curator}) ${delta >= 0 ? 'grew' : 'shrank'} ${pct(p)} in a day to ${usd(num(cur.total_assets_usd))}`,
      angle: `${usd(Math.abs(delta))} ${delta >= 0 ? 'in' : 'out'} of one vault in 24 hours.`,
      draft: `${cur.name}, curated by ${cur.curator}, went from ${usd(num(prev.total_assets_usd))} to ${usd(num(cur.total_assets_usd))} in a day (${pct(p)}). Moves this size in a single vault usually mean one allocator; the deposit and withdrawal events name them.`,
      handles: handlesFor('morpho', cur.curator), numbers: { tvl_before: num(prev.total_assets_usd), tvl_after: num(cur.total_assets_usd), delta_usd: delta }, source: 'morpho.fct_morpho_vault_daily',
      gate: { now_usd: num(cur.total_assets_usd), prior_usd: num(prev.total_assets_usd) },
    }));
  }
  return out;
}
