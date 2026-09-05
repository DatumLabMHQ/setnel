// Onchain Suite (Datum's own messaging product) as the hub's email door.
//
// Onchain Suite has no transactional "send this email" endpoint. Email goes out through an
// automation: the hub posts a custom event for the recipient (POST /events, contact by email),
// and an automation in the Onchain Suite dashboard with an `app_event` trigger on that event
// name and a `send_email` step delivers a template that reads the event payload
// ({{ event.message }}, {{ event.link }}, ...). Sending is therefore asynchronous: 202 means
// accepted, not delivered. See README "Email via Onchain Suite" for the automation recipe.
//
// Env: ONCHAINSUITE_SECRET_KEY (sk_live_… or sk_test_…; a test key dry-runs everything).

const API = process.env.ONCHAINSUITE_API_URL || 'https://api.onchainsuite.com/api/v1';

export const EVENTS = {
  incident: 'setnel_incident',   // one per recipient per notification
  digest: 'setnel_digest',       // weekly summary
} as const;

export function onchainsuiteConfigured(): boolean {
  return Boolean(process.env.ONCHAINSUITE_SECRET_KEY);
}

// Their queue rejects idempotency keys containing ':' (BullMQ custom id), despite the docs'
// examples. Keep keys to [A-Za-z0-9_-].
export function idempotencyKey(...parts: (string | number)[]): string {
  return parts.map((p) => String(p).replace(/[^A-Za-z0-9_-]+/g, '-')).join('-').slice(0, 256);
}

export type SendEventArgs = {
  event: string;
  email: string;
  payload: Record<string, string | number | boolean | null>;
  idempotencyKey: string;
  occurredAt?: Date;
};

export async function sendEvent(args: SendEventArgs): Promise<{ ok: boolean; error?: string; deduplicated?: boolean }> {
  const key = process.env.ONCHAINSUITE_SECRET_KEY;
  if (!key) return { ok: false, error: 'onchainsuite not configured' };
  try {
    const res = await fetch(`${API}/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        event: args.event,
        contact: { email: args.email },
        payload: args.payload,
        idempotencyKey: args.idempotencyKey,
        occurredAt: (args.occurredAt ?? new Date()).toISOString(),
      }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    let data: { accepted?: boolean; deduplicated?: boolean } = {};
    try { const j = JSON.parse(text); data = j.data ?? j; } catch { /* non-JSON 2xx: treat as accepted */ }
    if (data.accepted === false) return { ok: false, error: `not accepted: ${text.slice(0, 200)}` };
    return { ok: true, deduplicated: Boolean(data.deduplicated) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
