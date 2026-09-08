// Joel's daily_volume_spike: a protocol's 24h liquidation volume against its trailing 30-day daily average.
export async function evaluate({ sql, today, params, lib }) {
  const { usd, num, dayStr, title, handlesFor, signal } = lib;
  const rows = await sql`
    with daily as (select protocol, day, sum(debt_usd) as debt_usd, count(*)::int as events from sui.fct_sui_liquidations
                   where day between ${today}::date - (${params.baseline_days})::int and ${today}::date group by 1, 2),
    base as (select protocol, avg(debt_usd) as avg_usd, count(*)::int as days from daily where day < ${today}::date group by 1)
    select d.protocol, d.day, d.debt_usd, d.events, b.avg_usd, b.days from daily d join base b using (protocol)
    where d.day = ${today}::date and b.days >= ${params.min_baseline_days} and d.debt_usd >= ${params.min_volume_usd} and d.debt_usd >= b.avg_usd * ${params.multiple}`;
  return rows.map((r) => {
    const x = num(r.debt_usd) / num(r.avg_usd); const critical = x >= params.critical_multiple;
    return signal({
      rule: 'daily_volume_spike', product: 'sui', subject: `${r.protocol}:${dayStr(r.day)}`, day: dayStr(r.day), severity: critical ? 'critical' : 'warning',
      headline: `${title(r.protocol)} liquidation volume ${x.toFixed(1)}x its ${params.baseline_days}-day average on ${dayStr(r.day)}`,
      angle: `${usd(num(r.debt_usd))} of debt liquidated in ${r.events} events against a ${usd(num(r.avg_usd))} daily average.`,
      draft: `${title(r.protocol)} on Sui liquidated ${usd(num(r.debt_usd))} of debt on ${dayStr(r.day)}, ${x.toFixed(1)} times its trailing ${params.baseline_days}-day daily average of ${usd(num(r.avg_usd))}, across ${r.events} events. Per-event rows show whether one position or many drove it.`,
      handles: handlesFor(r.protocol), numbers: { debt_usd: num(r.debt_usd), avg_30d_usd: num(r.avg_usd), multiple: Number(x.toFixed(2)), events: r.events }, source: 'sui.fct_sui_liquidations',
    });
  });
}
