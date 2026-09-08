// The day's content brief: the new signals summarised in three layers, the house "3 step" format
// (datum-context/house/3step.md). Claude writes the prose; every figure it may use is in the signals
// it is given, and the digest prints those signal blocks under the layers so the reader can check.
import Anthropic from '@anthropic-ai/sdk';
import { sql } from './db';
import type { SignalRow } from './signals';

export type Brief = { day: string; layer1: string; layer2: string; layer3: string; model: string; signal_ids: string[] };

const MODEL = process.env.BRIEF_MODEL || 'claude-opus-5';

const SYSTEM = `You write Datum Labs' daily content brief from a list of signals produced by the Datum data platform.
Follow the "3 step" format exactly: one continuous summary in three layers of increasing length.
Layer 1 is one paragraph: the whole day at maximum compression, a complete stopping point on its own.
Layer 2 is two paragraphs that continue from Layer 1 without restating it, adding mechanism, key evidence, how the numbers were produced.
Layer 3 is three paragraphs that continue from Layer 2: specifics, numbers, context, limitations, implications.
Every prefix (1, 1+2, 1+2+3) must read as a self-contained summary at its depth. Nothing is repeated across layers; each only adds.
Compression is the point. Plain, direct sentences for a smart reader outside DeFi. Use the standard technical term when it is shorter or more precise; gloss a term once, in a few words, only if that reader would not know it.
Rules that override style: use only figures that appear in the signals; never invent, round beyond what is given, or extrapolate. Name the protocol and the day for each figure. Where a signal says a figure was checked against DefiLlama, say so once. If the signals are thin, the layers are short; do not pad.
Output format, and nothing else: the label "Layer 1" on its own line, then one paragraph; "Layer 2" on its own line, then two paragraphs separated by a blank line; "Layer 3" on its own line, then three paragraphs separated by blank lines. No other headers, bullets, bold or markdown.`;

function signalText(s: SignalRow): string {
  const p = s.payload ?? {};
  const nums = p.numbers ? Object.entries(p.numbers).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(', ') : '';
  return [`- ${s.message}`, p.angle ? `  angle: ${p.angle}` : '', p.draft ? `  draft: ${p.draft}` : '', nums ? `  numbers: ${nums}` : '', `  product: ${p.product ?? s.dashboard_id}; day: ${p.day ?? s.fired_at.slice(0, 10)}; rule: ${p.rule ?? s.detector_id}; source: ${p.source ?? ''}`].filter(Boolean).join('\n');
}

function parseLayers(text: string): { layer1: string; layer2: string; layer3: string } | null {
  const m = text.match(/Layer 1\s*\n([\s\S]*?)\n\s*Layer 2\s*\n([\s\S]*?)\n\s*Layer 3\s*\n([\s\S]*)$/i);
  if (!m) return null;
  const clean = (t: string) => t.trim().replace(/\*\*/g, '');
  return { layer1: clean(m[1]), layer2: clean(m[2]), layer3: clean(m[3]) };
}

export async function getBrief(day: string): Promise<Brief | null> {
  const rows = (await sql`SELECT day::text AS day, layer1, layer2, layer3, model, signal_ids FROM content_briefs WHERE day = ${day}::date LIMIT 1`) as Array<Omit<Brief, 'signal_ids'> & { signal_ids: (string | number)[] }>;
  return rows[0] ? { ...rows[0], signal_ids: rows[0].signal_ids.map(String) } : null;
}

/** Compose (or return today's stored) three-layer brief for the given signals. Returns null when no key is set. */
export async function composeBrief(day: string, signals: SignalRow[], force = false): Promise<Brief | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!force) { const existing = await getBrief(day); if (existing) return existing; }
  if (!signals.length) return null;
  const client = new Anthropic();
  const user = `Signals for ${day} (${signals.length}). Write the brief.\n\n${signals.map(signalText).join('\n\n')}`;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') throw new Error('brief refused by the model');
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
  const layers = parseLayers(text);
  if (!layers) throw new Error(`brief did not come back in three labelled layers: ${text.slice(0, 120)}`);
  const ids = signals.map((s) => Number(s.id));
  await sql`
    INSERT INTO content_briefs (day, layer1, layer2, layer3, model, signal_ids)
    VALUES (${day}::date, ${layers.layer1}, ${layers.layer2}, ${layers.layer3}, ${res.model}, ${ids})
    ON CONFLICT (day) DO UPDATE SET layer1 = EXCLUDED.layer1, layer2 = EXCLUDED.layer2, layer3 = EXCLUDED.layer3, model = EXCLUDED.model, signal_ids = EXCLUDED.signal_ids, created_at = now()`;
  return { day, ...layers, model: res.model, signal_ids: ids.map(String) };
}

export function briefText(b: Brief): string {
  return [`Layer 1`, b.layer1, '', `Layer 2`, b.layer2, '', `Layer 3`, b.layer3].join('\n');
}
