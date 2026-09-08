import { loadDefillama } from './_defillama.mjs';
export async function evaluate({ sql, today, params, lib }) {
  const { usd, pct, title, handlesFor, signal, addDays } = lib;
  const bySlug = await loadDefillama({ sql, today, days: 9 });
  const out = [];
  for (const [slug, s] of Object.entries(bySlug)) {
    if (params.exclude?.includes(slug)) continue;
    const days = Object.keys(s.total).sort(); if (days.length < 2) continue;
    const d0 = days[days.length - 1], d7 = days.find((d) => d <= addDays(d0, -7)) ?? days[0];
    if (d7 === d0 || !(s.total[d7] > 0)) continue;
    const wow = ((s.total[d0] - s.total[d7]) / s.total[d7]) * 100;
    const line = s.total[d0] >= params.large_tvl_usd ? params.pct_large : params.pct_small;
    if (Math.abs(wow) < line) continue;
    out.push(signal({
      rule: 'tvl_wow', product: slug, subject: slug, day: d0,
      headline: `${title(slug)} TVL ${pct(wow)} week over week to ${usd(s.total[d0])}`,
      angle: `${wow >= 0 ? 'Growth' : 'Drawdown'} narrative: ${usd(s.total[d7])} on ${d7} to ${usd(s.total[d0])} on ${d0}, all chains.`,
      draft: `${title(slug)} closed the week at ${usd(s.total[d0])} TVL across all chains, ${pct(wow)} versus ${usd(s.total[d7])} seven days earlier. ${wow >= 0 ? 'Worth asking which chain and which asset carried it.' : 'Worth asking whether it is rates, a single large exit, or a chain-level move.'}`,
      handles: handlesFor(slug), numbers: { tvl_week_ago: s.total[d7], tvl_now: s.total[d0], wow_pct: Number(wow.toFixed(2)) }, source: 'ref.raw_defillama_tvl',
      gate: { now_usd: s.total[d0], prior_usd: s.total[d7] },
    }));
  }
  return out;
}
