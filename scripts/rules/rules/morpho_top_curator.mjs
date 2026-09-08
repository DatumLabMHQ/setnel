import { loadCurators } from './_morpho.mjs';
export async function evaluate({ sql, today, params, lib }) {
  const { usd, pp, num, handlesFor, signal } = lib;
  const byDay = await loadCurators({ sql, today, days: 2 });
  const cdays = Object.keys(byDay).sort(); if (cdays.length < 2) return [];
  const d0 = cdays[cdays.length - 1], d1 = cdays[cdays.length - 2];
  const a = byDay[d0][0], b = byDay[d1][0]; if (!a || !b) return [];
  const leadShift = (num(a.share_of_vault_tvl) - num(b.share_of_vault_tvl)) * 100;
  if (a.curator === b.curator && Math.abs(leadShift) < params.share_shift_pp) return [];
  return [signal({
    rule: 'morpho_top_curator', product: 'morpho', subject: a.curator !== b.curator ? `leader:${a.curator}` : `share:${a.curator}`, day: d0,
    headline: a.curator !== b.curator ? `${a.curator} is now the largest Morpho curator, overtaking ${b.curator}` : `${a.curator}'s share of Morpho vault TVL moved ${pp(leadShift)} in a day`,
    angle: `${a.curator} ${usd(num(a.tvl_usd))} (${(num(a.share_of_vault_tvl) * 100).toFixed(1)}%)${a.curator !== b.curator ? ` vs ${b.curator} the day before` : ''}.`,
    draft: a.curator !== b.curator
      ? `${a.curator} now curates ${usd(num(a.tvl_usd))} across Morpho vaults, ${(num(a.share_of_vault_tvl) * 100).toFixed(1)}% of listed vault TVL, and has overtaken ${b.curator} as the largest curator. Counting Vault V2 is what changes this picture; V1-only views still show the old leader.`
      : `${a.curator}'s share of listed Morpho vault TVL moved ${pp(leadShift)} in a day to ${(num(a.share_of_vault_tvl) * 100).toFixed(1)}% (${usd(num(a.tvl_usd))}).`,
    handles: handlesFor('morpho', a.curator, b.curator), numbers: { tvl_usd: num(a.tvl_usd), share_pct: Number((num(a.share_of_vault_tvl) * 100).toFixed(1)), share_shift_pp: Number(leadShift.toFixed(1)) }, source: 'morpho.fct_morpho_curator_daily',
    gate: { now_usd: num(a.tvl_usd), prior_usd: num(b.tvl_usd) },
  })];
}
