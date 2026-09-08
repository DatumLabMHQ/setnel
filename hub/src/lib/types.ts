import { z } from 'zod';

// The payload a dashboard POSTs to /api/v1/events. One detector run can emit
// many events in a single batch.
export const IncomingEventSchema = z.object({
  detectorId: z.string().min(1),
  category: z.enum([
    'liquidity',
    'liquidations',
    'flows',
    'risk-parameters',
    'oracles',
    'governance',
    'revenue',
    'whale-activity',
    'depegging',
    'technical',
    // Content signals: a story angle with draft text and handles, generated from the data
    // platform's curated tables. Stored, never an incident, never paged. See /setnel/content.
    'signal',
  ]),
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  message: z.string().min(1).max(1000),
  // Stable dedup key. If omitted, the Hub derives one from detectorId.
  fingerprint: z.string().min(1).max(300).optional(),
  // Deep-link path within the source dashboard, e.g. '/markets/USDT'.
  linkPath: z.string().startsWith('/').max(500).optional(),
  payload: z.record(z.unknown()).optional(),
  // Content signals only: hours the hub keeps one signal per fingerprint (the rule's cooldown). Default 168.
  cooldownHours: z.number().int().min(1).max(24 * 366).optional(),
});

// Metric samples a detector run reports every time (not just on breach).
// These populate the metric time-series store.
export const MetricSampleSchema = z.object({
  metricKey: z.string().min(1).max(200),
  value: z.number().finite(),
  source: z.string().max(40).optional(), // default 'dashboard'
});

export const EventBatchSchema = z.object({
  dashboardId: z.string().min(1),
  events: z.array(IncomingEventSchema).max(200),
  samples: z.array(MetricSampleSchema).max(500).optional(),
});

export type IncomingEvent = z.infer<typeof IncomingEventSchema>;
export type MetricSample = z.infer<typeof MetricSampleSchema>;
export type EventBatch = z.infer<typeof EventBatchSchema>;

// The rules manifest a detector run posts (rules/*.yml in this repo), so the Content page shows what can fire.
export const RuleManifestSchema = z.object({
  dashboardId: z.string().min(1),
  rules: z.array(z.object({
    id: z.string().min(1).max(80), owner: z.string().max(40), product: z.string().max(60),
    schedule: z.enum(['hourly', 'daily', 'weekly']), status: z.enum(['live', 'waiting', 'off']),
    needs: z.string().max(500).nullable().optional(), description: z.string().max(1000),
    severity: z.enum(['info', 'warning', 'critical', 'emergency']), cooldown_hours: z.number(),
    params: z.record(z.unknown()).optional(), gates: z.record(z.unknown()).optional(), source: z.string().max(200).nullable().optional(),
  })).max(200),
  run: z.object({ schedule: z.string(), today: z.string(), ran: z.array(z.string()), signals: z.number(), errors: z.array(z.unknown()) }).optional(),
});
