import { loadDefillama } from './_defillama.mjs';
export async function evaluate({ sql, today, params, lib }) {
  const { usd, pct, title, handlesFor, signal } = lib;
  const bySlug = await loadDefillama({ sql, today, days: 3 });
  const out = [];
  for (const slug of params.protocols) {
    const s = bySlug[slug]; if (!s) continue;
    const days = Object.keys(s.eth).sort(); if (days.length < 2) continue;
    const d0 = days[days.length - 1], d1 = days[days.length - 2];
    const delta = s.eth[d0] - s.eth[d1];
    if (Math.abs(delta) < params.notable_usd) continue;
    const major = Math.abs(delta) >= params.major_usd; const dir = delta >= 0 ? 'inflow' : 'outflow';
    out.push(signal({
      rule: 'net_flow_24h', product: slug, subject: `${slug}:${major ? 'major' : 'notable'}`, day: d0, severity: major ? 'warning' : 'info',
      headline: `${title(slug)} saw a ${usd(Math.abs(delta))} Ethereum ${dir} in a day${major ? ' (major)' : ''}`,
      angle: `${major ? 'Major' : 'Notable'} 24h ${dir} on Ethereum: ${usd(s.eth[d1])} to ${usd(s.eth[d0])} (${pct((delta / s.eth[d1]) * 100)}).`,
      draft: `${title(slug)} Ethereum TVL moved from ${usd(s.eth[d1])} to ${usd(s.eth[d0])} between ${d1} and ${d0}, a ${usd(Math.abs(delta))} ${dir} in 24 hours. ${major ? `That is above the ${usd(params.major_usd)} line treated as a regime-level move.` : `That clears the ${usd(params.notable_usd)} line treated as worth a note.`} Source: DefiLlama, reconciled against the platform.`,
      handles: handlesFor(slug), numbers: { tvl_before: s.eth[d1], tvl_after: s.eth[d0], delta_usd: delta }, source: 'ref.raw_defillama_tvl',
      gate: { now_usd: s.eth[d0], prior_usd: s.eth[d1] },
    }));
  }
  return out;
}
