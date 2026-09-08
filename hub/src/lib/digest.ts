// The daily content digest: every new signal from the last window, as one plain-text email.
// Plain text on purpose: it reads in any client, quotes cleanly into a doc, and never breaks.
import { getSignals, type SignalRow } from './signals';
import { composeBrief, briefText, type Brief } from './brief';

const HUB = (process.env.SETNEL_SELF_URL || 'https://setnel.datumlab.xyz').replace(/\/$/, '');

function fmtNumbers(n: Record<string, number | string | null> | undefined): string {
  if (!n) return '';
  return Object.entries(n).filter(([, v]) => v != null).map(([k, v]) => `${k} ${typeof v === 'number' ? (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Number.isInteger(v) ? v : v.toFixed(2)) : v}`).join(' · ');
}

function block(s: SignalRow): string {
  const p = s.payload ?? {};
  const lines = [`• ${s.message}`];
  if (p.angle && p.angle !== s.message) lines.push(`  angle: ${p.angle}`);
  if (p.draft) lines.push(`  draft: ${p.draft}`);
  if (p.handles?.length) lines.push(`  tag: ${p.handles.join(' ')}`);
  const nums = fmtNumbers(p.numbers); if (nums) lines.push(`  numbers: ${nums}`);
  lines.push(`  source: ${p.source ?? s.detector_id}${p.day ? ` · ${p.day}` : ''} · rule ${p.rule ?? s.detector_id}`);
  return lines.join('\n');
}

export async function buildDigest(days = 1, opts: { brief?: boolean; force?: boolean } = {}): Promise<{ subject: string; text: string; count: number; signals: SignalRow[]; brief: Brief | null }> {
  // Same rule + same headline within the window (a manual run beside the scheduled one) counts once: keep the latest.
  const seen = new Set<string>();
  const signals = (await getSignals({ status: 'new', days, limit: 200 })).filter((s) => { const k = `${s.detector_id}|${s.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const date = new Date().toISOString().slice(0, 10);
  let brief: Brief | null = null;
  if (opts.brief !== false) { try { brief = await composeBrief(date, signals, opts.force); } catch (e) { console.warn('[digest] brief skipped:', e instanceof Error ? e.message : e); } }
  const byProduct = new Map<string, SignalRow[]>();
  for (const s of signals) { const k = (s.payload?.product ?? s.dashboard_id) || 'other'; byProduct.set(k, [...(byProduct.get(k) ?? []), s]); }
  const sections = [...byProduct.entries()].map(([prod, rows]) => `${prod.toUpperCase()} (${rows.length})\n${'-'.repeat(prod.length + 4)}\n${rows.map(block).join('\n\n')}`);
  const text = [
    `Setnel content signals · ${date}`,
    `${signals.length} new signal${signals.length === 1 ? '' : 's'} in the last ${days * 24} hours. Every number comes from the Datum data platform's curated tables; each block names its rule and source so the figure can be reproduced.`,
    ...(brief ? [`THE DAY IN THREE LAYERS (stop at any boundary)`, briefText(brief)] : []),
    `THE SIGNALS`,
    ...(sections.length ? sections : ['Nothing new today. The rules ran and found no move worth writing about.']),
    `Mark signals used or dismissed on the Content page: ${HUB}/setnel/content`,
    `Definitions: datum-context/metrics. Disagreements with other sources: datum-context/evals/divergence-log.md.`,
  ].join('\n\n');
  const subject = signals.length ? `Setnel signals ${date}: ${signals.length} new (${[...byProduct.keys()].join(', ')})` : `Setnel signals ${date}: nothing new`;
  return { subject, text, count: signals.length, signals, brief };
}
