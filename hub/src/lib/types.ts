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
