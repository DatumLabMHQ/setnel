import { loadCurators } from './_morpho.mjs';
export async function evaluate({ sql, today, params, lib }) {
  const { usd, pp, num, handlesFor, signal, addDays } = lib;
  const byDay = await loadCurators({ sql, today, days: 8 });
  const cdays = Object.keys(byDay).sort(); if (cdays.length < 2) return [];
  const d0 = cdays[cdays.length - 1], d1 = cdays[cdays.length - 2], d7 = cdays.find((d) => d <= addDays(d0, -7)) ?? cdays[0];
  const hhi = (rows) => rows.reduce((a, r) => a + Math.pow(num(r.share_of_vault_tvl) * 100, 2), 0);
  const top3 = (rows) => rows.slice(0, 3).reduce((a, r) => a + num(r.share_of_vault_tvl) * 100, 0);
  const h0 = hhi(byDay[d0]), h1 = hhi(byDay[d1]), h7 = hhi(byDay[d7]);
  const t0 = top3(byDay[d0]), t1 = top3(byDay[d1]);
  const reasons = [];
  for (const line of params.lines) { if (h1 < line && h0 >= line) reasons.push(`crossed ${line}`); if (h1 >= line && h0 < line) reasons.push(`fell back below ${line}`); }
  if (d7 !== d0 && Math.abs(h0 - h7) > params.week_points) reasons.push(`moved ${h0 - h7 >= 0 ? '+' : ''}${(h0 - h7).toFixed(0)} points in 7 days`);
  if (Math.abs(t0 - t1) > params.top3_pp) reasons.push(`top-3 share moved ${pp(t0 - t1)} in a day`);
  if (!reasons.length) return [];
  const lead = byDay[d0].slice(0, 3);
  return [signal({
    rule: 'morpho_curator_hhi', product: 'morpho', subject: `curators:${reasons[0].split(' ')[0]}`, day: d0,
    headline: `Morpho curator concentration (HHI ${h0.toFixed(0)}) ${reasons[0]}`,
    angle: `${reasons.join('; ')}. Top three: ${lead.map((r) => `${r.curator} ${(num(r.share_of_vault_tvl) * 100).toFixed(1)}%`).join(', ')}.`,
    draft: `Curator concentration on Morpho vaults (V1 and V2, listed only) reads HHI ${h0.toFixed(0)} today${d7 !== d0 ? ` versus ${h7.toFixed(0)} a week ago` : ''}. ${lead.map((r) => `${r.curator} runs ${usd(num(r.tvl_usd))} (${(num(r.share_of_vault_tvl) * 100).toFixed(1)}%)`).join(', ')}. Above 2500 is the line regulators call highly concentrated; the question for Morpho is whether that is a feature of early curation or a risk.`,
    handles: handlesFor('morpho', ...lead.map((r) => r.curator)), numbers: { hhi: Number(h0.toFixed(0)), hhi_week_ago: Number(h7.toFixed(0)), top3_share_pct: Number(t0.toFixed(1)) }, source: 'morpho.fct_morpho_curator_daily',
  })];
}
