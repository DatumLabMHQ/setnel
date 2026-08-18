// Setnel dead-man's-switch watchdog.
//
// Runs from GitHub Actions on its own schedule, independent of the Hub and the
// per-dashboard crons. It answers "is Setnel itself still alive?" — the failure
// mode nothing else can catch (if the Hub is down or the heartbeat stops, no
// alert would ever fire). On a problem it pings Telegram DIRECTLY (not via the
// Hub), so it works even when the Hub is down.
//
// Plain Node (global fetch), no dependencies — so it can't fail for the same
// reason the thing it watches might.

const STATUS_URL = process.env.SETNEL_STATUS_URL || 'https://setnel.datumlab.xyz/api/v1/status';
const STALE_MIN = Number(process.env.SETNEL_STALE_MIN || '20'); // dashboards ping every 5m
// The watchdog has no cooldown — it fires every 15 min a condition holds. A few
// old rows stuck in the dead-letter are not an every-15-min emergency, so only
// page once the backlog is real (a genuine delivery meltdown climbs fast).
const DEADLETTER_MIN = Number(process.env.SETNEL_DEADLETTER_MIN || '20');
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

// A single Vercel/Neon cold start can push /api/v1/status past a tight timeout
// (we've seen 12-18s spin-ups). One slow response is not an outage, so we retry
// a few times before concluding the Hub is unreachable. A genuinely dead Hub
// fails every attempt; a one-off cold start does not.
const TIMEOUT_MS = Number(process.env.SETNEL_TIMEOUT_MS || '25000');
const ATTEMPTS = Number(process.env.SETNEL_RETRIES || '3');
const RETRY_DELAY_MS = Number(process.env.SETNEL_RETRY_DELAY_MS || '5000');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(text) {
  if (!TOKEN || !CHAT) {
    console.error('telegram not configured; would have sent:\n' + text);
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!r.ok) console.error('watchdog TG send failed', r.status, await r.text().catch(() => ''));
}

// Fetch the status endpoint, retrying transient failures (cold-start timeouts,
// 5xx) before we conclude the Hub is down. Returns parsed JSON on success, or
// throws an Error whose message describes the last failure.
async function fetchStatus() {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(STATUS_URL, { signal: ctrl.signal });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(t);
    }
    if (attempt < ATTEMPTS) {
      console.error(`watchdog: attempt ${attempt}/${ATTEMPTS} failed (${lastErr?.message || lastErr}); retrying in ${RETRY_DELAY_MS}ms`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr || new Error('unknown error');
}

async function main() {
  let json;
  try {
    json = await fetchStatus();
  } catch (err) {
    await tg(`🚨 Setnel watchdog: cannot reach the Hub after ${ATTEMPTS} attempts (${err?.message || err}). The Hub may be down — alerts could be silently failing.`);
    process.exitCode = 1;
    return;
  }

  if (json.ok === false) {
    await tg(`🚨 Setnel watchdog: Hub reported an error (${json.error || 'unknown'}).`);
    process.exitCode = 1;
    return;
  }

  const problems = [];

  // Whole-fleet silence: no check-ins from ANY dashboard recently.
  if (json.lastCheckAgeMin == null || json.lastCheckAgeMin > STALE_MIN) {
    problems.push(
      `No dashboard check-ins in ${json.lastCheckAgeMin == null ? 'a long time' : json.lastCheckAgeMin + ' min'} — collection may be down (heartbeat stopped?).`,
    );
  }

  // Individual dashboards gone quiet (but fleet otherwise alive).
  const quiet = (json.dashboards || []).filter((d) => d.ageMin == null || d.ageMin > STALE_MIN);
  if (quiet.length && json.lastCheckAgeMin != null && json.lastCheckAgeMin <= STALE_MIN) {
    problems.push(
      'Dashboard(s) quiet: ' + quiet.map((d) => `${d.name} (${d.ageMin == null ? 'never' : d.ageMin + 'm'})`).join(', '),
    );
  }

  // Undelivered alerts sitting in the dead-letter. Only page on a real backlog:
  // a handful of stuck rows must not re-page every 15 min (no cooldown here).
  if (json.failedNotifications >= DEADLETTER_MIN) {
    problems.push(`${json.failedNotifications} undelivered alert(s) in the dead-letter (>= ${DEADLETTER_MIN}) — delivery may be broken.`);
  }

  if (problems.length) {
    await tg('⚠️ Setnel watchdog:\n• ' + problems.join('\n• '));
    process.exitCode = 1;
  } else {
    console.log(`watchdog ok — last check ${json.lastCheckAgeMin}m ago, ${json.dashboards?.length || 0} dashboards healthy`);
  }
}

main();
