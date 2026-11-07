import { sql } from './db';
import { getHeartbeats, recordHeartbeat } from './admin';
import { notifyTelegram } from './notify';

// The monitor monitoring itself. Called from the analyze pass (every 30m): if any
// Setnel cron has gone stale, page once, throttled to at most every 2h so a
// persistently-dead job doesn't spam. This is the dead-man's-switch for the
// jobs that generate every other alert.
export async function checkAndPageStaleCrons(): Promise<{ stale: string[]; paged: boolean }> {
  const hbs = await getHeartbeats();
  const stale = hbs.filter((h) => h.job !== 'selfalert' && h.stale);
  if (!stale.length) return { stale: [], paged: false };

  const last = (await sql`SELECT last_run_at FROM cron_heartbeats WHERE job = 'selfalert'`) as { last_run_at: string }[];
  const throttled = last[0] && Date.now() - new Date(last[0].last_run_at).getTime() < 2 * 60 * 60 * 1000;
  if (throttled) return { stale: stale.map((s) => s.job), paged: false };

  const lines = stale.map((s) => `• ${s.job}: last run ${s.staleMin}m ago (expected every ${s.expectedMin}m)`).join('\n');
  await notifyTelegram({
    dashboardName: 'Setnel Hub',
    severity: 'critical',
    category: 'escalation',
    message: `🩺 Setnel self-check: ${stale.length} cron job(s) stale — the monitor may be blind.\n${lines}`,
    deepLink: 'https://setnel-hub.datumlabs.workers.dev/setnel/settings',
  });
  await recordHeartbeat('selfalert', stale.map((s) => s.job).join(','));
  return { stale: stale.map((s) => s.job), paged: true };
}
