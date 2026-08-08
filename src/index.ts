import 'dotenv/config';
import { loadConfig } from './config.js';
import { runCheck } from './check.js';
import { runDigest } from './digest.js';
import { renderAlertText } from './render.js';
import { sendTelegram } from './notifiers/telegram.js';

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const configPathFlag = rest.indexOf('--config');
  const configPath = configPathFlag >= 0 ? rest[configPathFlag + 1] : undefined;

  const config = loadConfig(configPath);

  switch (cmd) {
    case 'validate-config': {
      console.log(
        `Config OK — ${config.dashboards.length} dashboards, ` +
          `${config.dashboards.reduce((n, d) => n + d.metrics.length, 0)} metrics total.`,
      );
      for (const d of config.dashboards) {
        console.log(`  • ${d.name} (${d.enabled ? 'enabled' : 'disabled'}): ${d.metrics.length} metrics`);
      }
      return;
    }

    case 'check': {
      const { alerts, samples } = await runCheck(config);
      const dataAlerts = alerts.filter((a) => a.kind === 'metric');
      const techAlerts = alerts.filter((a) => a.kind === 'technical');
      console.log(
        `check: ${samples.length} samples, ${alerts.length} alerts ` +
          `(${dataAlerts.length} data, ${techAlerts.length} technical, ` +
          `${alerts.filter((a) => a.critical).length} critical)`,
      );
      // Telegram = data alerts only. Technical alerts get batched into the
      // 12-hour email digest so the channel stays high-signal.
      if (config.notifications.telegram.enabled && dataAlerts.length > 0) {
        for (const alert of dataAlerts) {
          try {
            await sendTelegram(renderAlertText(alert));
          } catch (err) {
            console.error('[check] telegram failed:', err);
          }
        }
      }
      // A fired alert is expected output, not a CI failure — it's already
      // delivered via Telegram (data) and the email digest (technical). Failing
      // the run here just spams a redundant "Run failed" email for the same
      // event. Surface critical alerts as a GitHub Actions warning annotation
      // instead: the run is still flagged in the Actions tab, without failing.
      const criticalCount = alerts.filter((a) => a.critical).length;
      if (criticalCount > 0) {
        console.log(`::warning::monitor-check: ${criticalCount} critical alert(s) fired — see Telegram / digest.`);
      }
      return;
    }

    case 'digest': {
      await runDigest(config);
      console.log('digest: sent.');
      return;
    }

    case 'warmup': {
      // Ping each enabled dashboard's healthPath to keep Vercel functions
      // hot. Cold starts can take 12-18s, which used to fire phantom timeout
      // alerts on the every-15-min check. Run this every 5 min from a
      // separate workflow — Vercel's idle window is ~5-10 min, so this keeps
      // the next monitor-check fast. We deliberately do NOT alert on
      // failures here; warmup misses are non-actionable and would just
      // create noise.
      const enabled = config.dashboards.filter((d) => d.enabled);
      const results = await Promise.allSettled(
        enabled.map(async (d) => {
          const url = `${d.baseUrl.replace(/\/$/, '')}${d.healthPath.startsWith('/') ? d.healthPath : '/' + d.healthPath}`;
          const started = Date.now();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30_000);
          try {
            const res = await fetch(url, { signal: controller.signal });
            return { name: d.name, ok: res.ok, status: res.status, ms: Date.now() - started };
          } finally {
            clearTimeout(timer);
          }
        }),
      );
      let warm = 0;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const name = enabled[i].name;
        if (r.status === 'fulfilled') {
          if (r.value.ok) warm++;
          console.log(`  ${r.value.ok ? '✓' : '✗'} ${name}: HTTP ${r.value.status} in ${r.value.ms}ms`);
        } else {
          console.log(`  ✗ ${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        }
      }
      console.log(`warmup: ${warm}/${enabled.length} dashboards warm.`);
      return;
    }

    default: {
      console.error(
        `Usage: datum-monitor <check|digest|warmup|validate-config> [--config path/to/dashboards.yaml]`,
      );
      process.exit(2);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
