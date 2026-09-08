// Shared helpers for rule modules: formatting, handles, and the signal() event builder.
// Voice rules (Joel's 7.8): no dashes, no first person plural, K notation under $1M, "%" not "percent".

export const HANDLES = {
  'morpho-blue': '@MorphoLabs', morpho: '@MorphoLabs', 'aave-v3': '@aave', 'aave-v2': '@aave', 'aave-v4': '@aave', aave: '@aave',
  sparklend: '@sparkdotfi', 'compound-v3': '@compoundfinance', 'compound-v2': '@compoundfinance', 'fluid-lending': '@0xfluid',
  'euler-v2': '@eulerfinance', 'moonwell-lending': '@MoonwellDeFi', moonwell: '@MoonwellDeFi', 'sky-lending': '@SkyEcosystem', 'liquity-v1': '@LiquityProtocol', 'liquity-v2': '@LiquityProtocol',
  centrifuge: '@centrifuge', navi: '@navi_protocol', suilend: '@suilend', scallop: '@Scallop_io', alphalend: '@AlphaFiSUI', bucket: '@bucket_protocol',
  'Steakhouse Financial': '@SteakhouseFi', Gauntlet: '@gauntlet_xyz', SparkDAO: '@sparkdotfi', 'Sky Money': '@SkyEcosystem', Yearn: '@yearn', Sentora: '@Sentora_xyz',
  'Janus Henderson': '@JHIAdvisors', Anemoy: '@AnemoyCapital', horizon: '@aave', maple: '@maplefinance', superstate: '@superstatefunds', 'ondo-finance': '@OndoFinance',
};
export const handlesFor = (...keys) => [...new Set(keys.map((k) => HANDLES[k]).filter(Boolean))];

export const usd = (n) => { const a = Math.abs(n); const s = n < 0 ? '-' : ''; if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`; if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`; return `${s}$${a.toFixed(0)}`; };
export const pct = (x, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;
export const pp = (x, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}pp`;
export const num = (v) => (v == null ? null : Number(v));
// neon returns date columns as Date objects or ISO strings depending on the driver path; normalise to YYYY-MM-DD.
export const dayStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const title = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/**
 * Build one signal event. `subject` is the dedupe identity (Joel's `key`): every dimension the reader
 * would call a separate event, the threshold when several can be crossed, never the value itself.
 * `gate` carries the numbers the shared noise gates check (now_usd, prior_usd, now_units, prior_units).
 * `severity` defaults to info; rules raise it to warning or critical for the moves that warrant an
 * immediate email rather than the daily brief.
 */
export function signal({ rule, product, subject, day, headline, angle, draft, handles = [], numbers = {}, source, gate, severity = 'info' }) {
  return {
    detectorId: `content.${rule}`, category: 'signal', severity, message: headline,
    fingerprint: `signal:${rule}:${subject}`, linkPath: '/',
    payload: { rule, product, day: String(day), angle, draft, handles, numbers, source, gate },
  };
}

/** Group rows into series keyed by fn, preserving order. */
export function series(rows, keyFn) { const m = {}; for (const r of rows) (m[keyFn(r)] ??= []).push(r); return m; }
