import { SEVERITY_RANK, type Severity } from './db';

// Pure incident state-machine helpers, extracted so they can be unit-tested
// (the DB-bound code in ingest.ts / escalate.ts calls these).

export const RENOTIFY_ACKED_MS = Infinity; // acked → silent until escalation
export const RENOTIFY_URGENT_MS = 60 * 60 * 1000; // 1h for critical/emergency
export const RENOTIFY_NORMAL_MS = 6 * 60 * 60 * 1000; // 6h otherwise

export const RENOTIFY_MAX_MS = 24 * 60 * 60 * 1000; // never quieter than once a day

/**
 * How long to stay quiet before re-paging an unresolved, still-firing incident.
 *
 * The window widens the longer the incident stays open. A condition nobody has
 * resolved in a day is not news every hour, and a flat hourly repeat is what
 * turned one LUSD reading into ~39 pages on 2026-09-12. Critical backs off
 * 1h -> 4h -> 12h -> 24h at ages 0, 1h, 6h and 24h; warning starts at 6h and
 * reaches the same daily floor. Acknowledged incidents stay silent until the
 * severity climbs.
 */
export function renotifyWindowMs(acked: boolean, severity: Severity, openedAt?: string | null, nowMs: number = Date.now()): number {
  if (acked) return RENOTIFY_ACKED_MS;
  const base = SEVERITY_RANK[severity] >= SEVERITY_RANK.critical ? RENOTIFY_URGENT_MS : RENOTIFY_NORMAL_MS;
  if (!openedAt) return base;
  const HOUR = 60 * 60 * 1000;
  const ageMs = nowMs - new Date(openedAt).getTime();
  const factor = ageMs >= 24 * HOUR ? 24 : ageMs >= 6 * HOUR ? 12 : ageMs >= HOUR ? 4 : 1;
  return Math.min(base * factor, RENOTIFY_MAX_MS);
}

/** Did the severity climb versus the open incident's current severity? */
export function isSeverityEscalation(next: Severity, current: Severity): boolean {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current];
}

/**
 * Should an already-open incident re-page right now?
 *
 * `unchanged` means this reading is identical to the one already on the incident.
 * A number that has not moved is not new information, so it never re-pages: the
 * condition stays open on the console and in the weekly escalation summary, but
 * it stops arriving in anyone's inbox. A severity climb always pages, and an
 * incident that has never been paged at all always pages.
 */
export function shouldRenotify(args: {
  muted: boolean;
  escalated: boolean;
  unchanged?: boolean;
  notifiedAt: string | null;
  nowMs: number;
  windowMs: number;
}): boolean {
  if (args.muted) return false;
  if (args.escalated) return true;
  if (!args.notifiedAt) return true;
  if (args.unchanged) return false;
  return args.nowMs - new Date(args.notifiedAt).getTime() > args.windowMs;
}

/**
 * Should an active incident be (re-)escalated now? Mirrors the escalate.ts SQL as
 * a testable guard: critical+ , unacked, not muted, old enough, and not escalated
 * within the last window.
 */
export function shouldEscalate(
  row: { severity: Severity; acknowledgedAt: string | null; mutedUntil: string | null; openedAt: string; escalatedAt: string | null },
  nowMs: number,
  afterMin: number,
): boolean {
  if (SEVERITY_RANK[row.severity] < SEVERITY_RANK.critical) return false;
  if (row.acknowledgedAt) return false;
  if (row.mutedUntil && new Date(row.mutedUntil).getTime() > nowMs) return false;
  const windowMs = afterMin * 60 * 1000;
  if (nowMs - new Date(row.openedAt).getTime() < windowMs) return false;
  if (row.escalatedAt && nowMs - new Date(row.escalatedAt).getTime() < windowMs) return false;
  return true;
}
