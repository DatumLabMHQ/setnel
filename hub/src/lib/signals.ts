import { sql } from '@/lib/db';

// Content signals are events with category = 'signal'. The payload carries the editorial
// material: angle (one line), draft (two or three sentences), handles (accounts to tag),
// numbers (the figures the draft was written from) and source (the platform table).

export type SignalStatus = 'new' | 'used' | 'dismissed';

export type SignalPayload = {
  rule?: string;
  angle?: string;
  draft?: string;
  handles?: string[];
  numbers?: Record<string, number | string | null>;
  source?: string;
  product?: string;
  day?: string;
};

export type SignalRow = {
  id: string;
  dashboard_id: string;
  dashboard_name: string;
  detector_id: string;
  message: string;
  payload: SignalPayload;
  fingerprint: string;
  signal_status: SignalStatus;
  fired_at: string;
};

export async function getSignals(opts: { status?: SignalStatus | 'all'; days?: number; limit?: number } = {}): Promise<SignalRow[]> {
  const status = opts.status ?? 'new';
  const days = Math.max(1, Math.min(90, opts.days ?? 14));
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200));
  const rows = (await sql`
    SELECT e.id, e.dashboard_id, d.name AS dashboard_name, e.detector_id, e.message, e.payload, e.fingerprint,
           COALESCE(e.signal_status, 'new') AS signal_status, e.fired_at
    FROM events e JOIN dashboards d ON d.id = e.dashboard_id
    WHERE e.category = 'signal'
      AND e.fired_at > now() - (${days} || ' days')::interval
      AND (${status} = 'all' OR COALESCE(e.signal_status, 'new') = ${status})
    ORDER BY e.fired_at DESC
    LIMIT ${limit}
  `) as SignalRow[];
  return rows.map((r) => ({ ...r, id: String(r.id), payload: (r.payload ?? {}) as SignalPayload }));
}

export async function getSignalCounts(days = 14): Promise<{ newCount: number; used: number; dismissed: number }> {
  const [row] = (await sql`
    SELECT
      count(*) FILTER (WHERE COALESCE(signal_status, 'new') = 'new')::int AS new_count,
      count(*) FILTER (WHERE signal_status = 'used')::int AS used,
      count(*) FILTER (WHERE signal_status = 'dismissed')::int AS dismissed
    FROM events WHERE category = 'signal' AND fired_at > now() - (${days} || ' days')::interval
  `) as { new_count: number; used: number; dismissed: number }[];
  return { newCount: row?.new_count ?? 0, used: row?.used ?? 0, dismissed: row?.dismissed ?? 0 };
}

export async function setSignalStatus(id: string, status: SignalStatus): Promise<void> {
  await sql`UPDATE events SET signal_status = ${status} WHERE id = ${id} AND category = 'signal'`;
}
