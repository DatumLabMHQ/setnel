// Phase 3 — adaptive anomaly detection.
//
// Runs Hub-side over the metric_samples time-series. For each metric, it learns
// the rolling baseline (mean + stddev of recent history) and flags when the
// latest value deviates beyond Z sigma AND a minimum percent move. This adapts
// per metric — a volatile metric needs a bigger move to fire than a stable one,
// fixing the "fixed 10% threshold is noisy here, blind there" problem.
//
// Any metric a dashboard samples gets anomaly detection for free. It only fires
// once it has enough history (min-samples), so it's silent until it has learned.

import { sql, type DashboardRow, type Severity } from './db';
import { ingestBatch } from './ingest';
import { getBaselineConfigMap } from './admin';
import { evaluateLatest } from './detect';
import type { IncomingEvent } from './types';

const MIN_SAMPLES = Number(process.env.SETNEL_BASELINE_MIN_SAMPLES || '20');
const Z = Number(process.env.SETNEL_BASELINE_Z || '3');
const MIN_PCT = Number(process.env.SETNEL_BASELINE_MIN_PCT || '8'); // ignore tiny moves
const WINDOW = Number(process.env.SETNEL_BASELINE_WINDOW || '400'); // trailing samples

type Meta = {
  exposure: (v: number) => number | null;
  fmt: (v: number) => string;
  /** Absolute floor: the latest value must reach this before a deviation can fire. */
  floor?: number;
};

// Interpret a metric key: how to format it and whether it carries $ exposure.
function metricMeta(key: string): Meta {
  // Freshness metrics carry their own meaning: data a few seconds old is healthy no
  // matter how far that sits from a 2-second baseline. Only a real staleness budget
  // counts. (2026-09-13: rwa.data_age_hours paged critical for 8-second-old data.)
  if (key.endsWith('data_age_hours')) return { exposure: () => null, fmt: (v) => `${v.toFixed(2)}h`, floor: 6 };
  if (key === 'aave.utilization_pct') return { exposure: () => null, fmt: (v) => `${v.toFixed(1)}%` };
  if (key.endsWith('_hhi')) return { exposure: () => null, fmt: (v) => v.toFixed(0) };
  if (key.startsWith('sui.') && (key.endsWith('.tvl') || key === 'sui.tvl_total'))
    return { exposure: (v) => v * 1e6, fmt: (v) => `$${v.toFixed(1)}M` }; // stored in $M
  if (key.startsWith('aave.')) return { exposure: (v) => v, fmt: fmtUsd }; // stored in raw USD
  return { exposure: () => null, fmt: (v) => String(v) };
}

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

type BaselineResult = {
  metricKey: string;
  status: 'ok' | 'anomaly' | 'insufficient';
  z?: number;
  latest?: number;
  mean?: number;
};

export async function runBaselines(): Promise<{ checked: number; anomalies: number; results: BaselineResult[] }> {
  const metrics = (await sql`
    SELECT DISTINCT dashboard_id, metric_key
    FROM metric_samples WHERE source = 'dashboard'
  `) as { dashboard_id: string; metric_key: string }[];

  const results: BaselineResult[] = [];
  const eventsByDashboard = new Map<string, IncomingEvent[]>();
  const overrides = await getBaselineConfigMap();

  for (const m of metrics) {
    const ov = overrides.get(m.metric_key);
    if (ov && ov.enabled === false) continue; // baseline disabled for this metric
    const z_threshold = ov?.z ?? Z;
    const min_pct = ov?.minPct ?? MIN_PCT;

    const rows = (await sql`
      SELECT value FROM metric_samples
      WHERE dashboard_id = ${m.dashboard_id} AND metric_key = ${m.metric_key} AND source = 'dashboard'
      ORDER BY ts DESC LIMIT ${WINDOW}
    `) as { value: number }[];

    if (rows.length < MIN_SAMPLES) {
      results.push({ metricKey: m.metric_key, status: 'insufficient' });
      continue;
    }

    // Oldest → newest; evaluateLatest excludes the latest point from its baseline.
    const values = rows.map((r) => r.value).reverse();
    const evalResult = evaluateLatest(values, { z: z_threshold, minPct: min_pct, window: WINDOW, minSamples: MIN_SAMPLES });
    if (!evalResult) {
      results.push({ metricKey: m.metric_key, status: 'insufficient' });
      continue;
    }
    const { z, pct: pctFromMean, mean, latest } = evalResult;
    if (evalResult.stddev <= 0 || mean === 0) {
      results.push({ metricKey: m.metric_key, status: 'ok' });
      continue;
    }

    const meta = metricMeta(m.metric_key);
    if (meta.floor != null && Math.abs(latest) < meta.floor) {
      // Below the floor the metric is healthy by definition; a z-score on a tiny
      // baseline is a random number generator, not a signal.
      results.push({ metricKey: m.metric_key, status: 'ok', z, latest, mean });
      continue;
    }

    if (evalResult.fired) {
      const stddev = evalResult.stddev;
      // An unexplained statistical deviation is always "look at this", never
      // "act now": it says a number is unusual, not that money is at risk.
      // Critical is reserved for rules that know what the move means.
      const severity: Severity = 'warning';
      const dir = z > 0 ? 'above' : 'below';
      const exposureUsd = meta.exposure(latest);
      const ev: IncomingEvent = {
        detectorId: 'baseline.anomaly',
        category: 'flows',
        severity,
        message: `${m.metric_key} anomaly: ${meta.fmt(latest)} is ${z > 0 ? '+' : ''}${z.toFixed(1)}σ ${dir} its baseline (${meta.fmt(mean)}, ${pctFromMean > 0 ? '+' : ''}${pctFromMean.toFixed(1)}%)`,
        fingerprint: `baseline:${m.metric_key}`,
        linkPath: '/',
        payload: {
          metricKey: m.metric_key, latest, mean, stddev, z, pctFromMean,
          ...(exposureUsd != null ? { exposureUsd } : {}),
        },
      };
      const list = eventsByDashboard.get(m.dashboard_id) ?? [];
      list.push(ev);
      eventsByDashboard.set(m.dashboard_id, list);
      results.push({ metricKey: m.metric_key, status: 'anomaly', z, latest, mean });
    } else {
      results.push({ metricKey: m.metric_key, status: 'ok', z, latest, mean });
    }
  }

  let anomalies = 0;
  for (const [dashboardId, events] of eventsByDashboard) {
    const dash = (await sql`SELECT * FROM dashboards WHERE id = ${dashboardId} LIMIT 1`) as DashboardRow[];
    if (dash[0]) {
      await ingestBatch(dash[0], events);
      anomalies += events.length;
    }
  }

  return { checked: metrics.length, anomalies, results };
}
