import { sql, type Severity } from './db';
import { EVENTS, idempotencyKey, onchainsuiteConfigured, sendEvent } from './onchainsuite';

const SEVERITY_PREFIX: Record<Severity, string> = {
  info: 'ℹ️ Info',
  warning: '⚠️ Warning',
  critical: '🚨 CRITICAL',
  emergency: '🚨🚨🚨 EMERGENCY',
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One raw Telegram send attempt. Returns ok + error detail. */
async function sendTelegramOnce(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: 'telegram not configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a data alert to Telegram with retry. On final failure, write to the
 * dead-letter table so a delivery failure is never silently lost.
 * Plain text (no parse_mode) so stray <, >, & can't break the API call.
 */
export async function notifyTelegram(args: {
  dashboardName: string;
  severity: Severity;
  category: string;
  message: string;
  deepLink: string;
  incidentId?: string | number;
}): Promise<boolean> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.warn('[notify] telegram not configured — skipping');
    return false;
  }

  const text = [
    `${SEVERITY_PREFIX[args.severity]} • ${args.dashboardName}`,
    args.message,
    '',
    `Open: ${args.deepLink}`,
  ].join('\n');

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await sendTelegramOnce(text);
    if (r.ok) return true;
    lastError = r.error ?? 'unknown';
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }

  // All attempts failed — dead-letter it.
  console.error('[notify] telegram failed after retries:', lastError);
  try {
    await sql`
      INSERT INTO failed_notifications (channel, incident_id, message, error, attempts)
      VALUES ('telegram', ${args.incidentId ?? null}, ${text}, ${lastError}, ${MAX_ATTEMPTS})
    `;
  } catch (e) {
    console.error('[notify] dead-letter write failed', e);
  }
  return false;
}

/** One raw email send via Resend's HTTP API. Env-guarded; no-op if unconfigured. */
async function sendEmailOnce(subject: string, text: string, recipients: string[]): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SETNEL_EMAIL_FROM;
  if (!key || !from) return { ok: false, error: 'email not configured' };
  if (!recipients.length) return { ok: false, error: 'no recipients' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: recipients.slice(0, 50), subject: subject.slice(0, 200), text }),
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Is email delivery configured? Onchain Suite (preferred) or the legacy Resend pair. */
export function emailConfigured(): boolean {
  return onchainsuiteConfigured() || Boolean(process.env.RESEND_API_KEY && process.env.SETNEL_EMAIL_FROM);
}

/**
 * Email through Onchain Suite: one `setnel_incident` event per recipient. The automation in the
 * Onchain Suite dashboard turns it into the email. Idempotent per incident, recipient and
 * 10-minute bucket, so a retried notify does not double-send.
 */
async function sendViaOnchainSuite(args: {
  subject: string; dashboardName: string; severity: Severity; message: string; deepLink: string;
  recipients: string[]; incidentId?: string | number;
}): Promise<{ ok: boolean; error?: string }> {
  const bucket = Math.floor(Date.now() / 600_000);
  const errors: string[] = [];
  let sent = 0;
  for (const email of args.recipients.slice(0, 50)) {
    const r = await sendEvent({
      event: EVENTS.incident,
      email,
      payload: {
        subject: args.subject.slice(0, 200),
        dashboard: args.dashboardName,
        severity: args.severity,
        severity_label: SEVERITY_PREFIX[args.severity],
        message: args.message.slice(0, 2000),
        link: args.deepLink,
        incident_id: args.incidentId == null ? null : String(args.incidentId),
      },
      idempotencyKey: idempotencyKey('setnel-incident', args.incidentId ?? 'na', email, bucket),
    });
    if (r.ok) sent += 1; else errors.push(`${email}: ${r.error}`);
  }
  return sent > 0 ? { ok: true } : { ok: false, error: errors.join('; ').slice(0, 300) || 'no recipients' };
}

/** Generic one-shot email (login links, digests). Returns success. */
export async function sendMail(subject: string, text: string, recipients: string[]): Promise<boolean> {
  const r = await sendEmailOnce(subject, text, recipients);
  if (!r.ok) console.warn('[mail] send skipped/failed:', r.error);
  return r.ok;
}

/** Send an alert email with retry + dead-letter, mirroring notifyTelegram. */
export async function notifyEmail(args: {
  dashboardName: string;
  severity: Severity;
  message: string;
  deepLink: string;
  recipients: string[];
  incidentId?: string | number;
}): Promise<boolean> {
  if (!emailConfigured() || !args.recipients.length) return false;
  const subject = `${SEVERITY_PREFIX[args.severity]} • ${args.dashboardName}`;
  const text = [`${args.dashboardName} — ${args.severity}`, '', args.message, '', `Open: ${args.deepLink}`].join('\n');

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = onchainsuiteConfigured()
      ? await sendViaOnchainSuite({ subject, dashboardName: args.dashboardName, severity: args.severity, message: args.message, deepLink: args.deepLink, recipients: args.recipients, incidentId: args.incidentId })
      : await sendEmailOnce(subject, text, args.recipients);
    if (r.ok) return true;
    lastError = r.error ?? 'unknown';
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }
  console.error('[notify] email failed after retries:', lastError);
  try {
    await sql`
      INSERT INTO failed_notifications (channel, incident_id, message, error, attempts)
      VALUES ('email', ${args.incidentId ?? null}, ${text}, ${lastError}, ${MAX_ATTEMPTS})
    `;
  } catch (e) {
    console.error('[notify] dead-letter write failed', e);
  }
  return false;
}

/**
 * Fan an alert out to the channels enabled for its severity. Callers resolve the
 * routing (channel_config) + email recipients (escalation_config) and pass them
 * in, so this stays free of the admin/data layer (no import cycle). Returns which
 * channels actually delivered; the incident is "notified" if any did.
 */
export async function deliverAlert(args: {
  dashboardName: string;
  severity: Severity;
  category: string;
  message: string;
  deepLink: string;
  incidentId?: string | number;
  channels: { telegram: boolean; email: boolean };
  emailRecipients: string[];
}): Promise<{ telegram: boolean; email: boolean; anySent: boolean }> {
  const telegram = args.channels.telegram
    ? await notifyTelegram({
        dashboardName: args.dashboardName, severity: args.severity, category: args.category,
        message: args.message, deepLink: args.deepLink, incidentId: args.incidentId,
      })
    : false;
  const email = args.channels.email
    ? await notifyEmail({
        dashboardName: args.dashboardName, severity: args.severity, message: args.message,
        deepLink: args.deepLink, recipients: args.emailRecipients, incidentId: args.incidentId,
      })
    : false;
  return { telegram, email, anySent: telegram || email };
}

// Whether a category is an internal/technical issue (TG-suppressed).
export function isTechnical(category: string): boolean {
  return category === 'technical';
}
