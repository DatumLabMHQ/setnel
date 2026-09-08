// Shared noise gates (Joel's section 7.1 and 7.2, once, for every rule).
//
// A percentage move on a tiny base is noise by construction, and a USD move on a volatile token is
// usually the market repricing what was already deposited. The engine runs every event through these
// gates using the rule's `gates:` block from its manifest, so no rule re-implements them.
//
//   min_usd         skip when the current value is under this (default 0: off)
//   nonzero_prior   skip when the prior value is missing or zero (default true)
//   min_units_pct   when units are known, skip unless the unit change is at least this % (default 0: off)
//
// Rules attach `gate: { now_usd, prior_usd, now_units?, prior_units? }` to each event. Events without a
// gate block pass untouched (threshold and all-time-high rules carry no delta to gate).

export function passesNoiseGates(gate, cfg = {}) {
  if (!gate) return { ok: true };
  const minUsd = Number(cfg.min_usd ?? 0);
  const nonzeroPrior = cfg.nonzero_prior !== false;
  const minUnitsPct = Number(cfg.min_units_pct ?? 0);
  const now = gate.now_usd == null ? null : Number(gate.now_usd);
  const prior = gate.prior_usd == null ? null : Number(gate.prior_usd);
  if (minUsd > 0 && (now == null || Math.abs(now) < minUsd)) return { ok: false, reason: `below min_usd ${minUsd}` };
  if (nonzeroPrior && gate.prior_usd !== undefined && (prior == null || prior === 0)) return { ok: false, reason: 'prior is zero or missing' };
  if (minUnitsPct > 0 && gate.now_units != null && gate.prior_units != null && Number(gate.prior_units) > 0) {
    const unitPct = (Math.abs(Number(gate.now_units) - Number(gate.prior_units)) / Number(gate.prior_units)) * 100;
    if (unitPct < minUnitsPct) return { ok: false, reason: `unit change ${unitPct.toFixed(2)}% under min_units_pct ${minUnitsPct}: a price move, not a flow` };
  }
  return { ok: true };
}
