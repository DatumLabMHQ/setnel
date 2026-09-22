# datum-monitor

> Part of [Atlas](https://github.com/DatumLabMHQ/atlas), Datum Labs' internal data infrastructure. Start there for how the parts fit together.

Alert + digest system for Datum Labs dashboards. Hits each dashboard's JSON
API routes on a schedule, compares values against thresholds, and pages the
risk team on breaches. Every 6 hours it emails + TGs a digest.

## Architecture

```
┌────────────────┐     every 15m        ┌──────────────────┐
│ GitHub Actions ├─────────────────────▶│   npm run check   │
│ monitor-check  │                      ├──────────────────┤
└────────────────┘                      │ 1. fetch /api/*  │
                                        │ 2. diff vs last  │───▶ Telegram (urgent)
┌────────────────┐     every 6h         │ 3. store fresh   │
│ GitHub Actions ├─────────────────────▶│ 4. fire alerts   │
│ monitor-digest │                      └──────────────────┘
└────────────────┘                               │
                                                 ▼
                                        ┌──────────────────┐
                                        │  Upstash Redis   │
                                        │ snapshots + hist │
                                        └──────────────────┘
                                                 │
                                        ┌────────┴─────────┐
                                        │  npm run digest  │───▶ Telegram + Email (6h report)
                                        └──────────────────┘
```

- **Urgent alerts**: Telegram only (instant; no inbox clutter).
- **6-hour digest**: Telegram + email (HTML report, per-dashboard metric tables).
- **State**: Upstash Redis free tier. Keys are namespaced `datum-monitor:*`.
- **Cooldown**: the same alert won't re-fire within 60 min (configurable via
  `ALERT_COOLDOWN_MINUTES`). This is why the exit code is non-zero only on
  *fresh* critical alerts.

## What it alerts on

- **Technical breakdowns** (always critical): HTTP ≥ 400, timeouts, non-JSON
  responses, missing expected JSON fields, partial-fetch `warnings[]` in the
  response body, `/api/health` returning non-`ok` status.
- **Metric anomalies**: per-metric `percentChange`, `absoluteMin`, `absoluteMax`
  rules encoded in `config/dashboards.yaml`. See that file for the v1 rule set
  (TVL drops, borrow spikes, utilization ceilings, liquidation spikes,
  revenue swings, redemption spikes, etc.).

## Setup

### 1. Install

```bash
cd datum-monitor
npm install
cp .env.example .env
# fill in .env with real creds
```

### 2. Create the external services (one-time)

**Upstash Redis** — [upstash.com/redis](https://upstash.com/redis), "Create
Database", copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from
the Details tab.

**Telegram bot** —
1. Chat with [@BotFather](https://t.me/BotFather) → `/newbot` → save the token.
2. Create a private channel or group, add the bot as admin.
3. Send any message in the channel, then visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the
   `chat.id` (negative number for channels).

**Resend** — [resend.com](https://resend.com). Add and verify your sending
domain (e.g. `alerts.datumlabs.xyz`), create an API key. Without a verified
domain you can only send to the test inbox.

### 3. Local test run

```bash
# Validate the YAML + show which dashboards are enabled
npm run lint:config

# Dry-run one check (uses Redis; will start writing snapshots)
npm run check

# Force a digest send
npm run digest
```

If any credential is missing, the relevant notifier silently skips (prints
a warning to stderr) so you can iterate on the fetch + threshold logic
without wiring everything up.

### 4. Deploy to GitHub Actions

Push this repo to GitHub (new private repo `datum-labs/datum-monitor`).
Settings → Secrets and variables → Actions → add:

| Secret | Source |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Details tab |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Details tab |
| `TELEGRAM_BOT_TOKEN` | BotFather |
| `TELEGRAM_CHAT_ID` | `getUpdates` output |
| `RESEND_API_KEY` | Resend dashboard |
| `EMAIL_FROM` | e.g. `alerts@datumlabs.xyz` (must be on verified domain) |
| `EMAIL_TO` | comma-separated recipient list |

The two scheduled workflows (`monitor-check.yml`, `monitor-digest.yml`) run
automatically once pushed to `main`. You can trigger them by hand from the
Actions tab via `workflow_dispatch`.

## Configuration — `config/dashboards.yaml`

Each dashboard block:

```yaml
- id: aave
  name: Aave
  baseUrl: https://aave.datumlabs.xyz
  healthPath: /api/health            # optional, default /api/health
  enabled: true
  metrics:
    - id: total_market_size           # unique within dashboard
      label: TVL (market size)        # shown in alerts + digest
      path: /api/aave/overview        # appended to baseUrl
      extract: totalMarketSize        # dot path into JSON response
      unit: usd                       # usd | percent | count | raw
      alert:
        percentChange: 15             # fire if |Δ%| > 15 vs last snapshot
        critical: true                # flag as critical (exit non-zero)
```

Supported `alert` fields:

- `percentChange: N` — fire if `|Δ%|` vs prior snapshot > N.
- `absoluteMin: N` / `absoluteMax: N` — hard bounds.
- `windowHours: N` — compare vs snapshot N hours ago (default: previous run).
- `critical: true` — mark as critical; exits the workflow non-zero.

Supported `extract` path syntax:

- Dot notation: `totals.tvlUsd`
- Array index: `pools[0].utilization` or `pools.0.utilization`

Set `allowMissing: true` on a metric if the field is legitimately optional
(e.g. `dataQuality` only present when reconciliation ran) — otherwise
missing fields fire a technical alert.

## Adding a new dashboard

1. Deploy the dashboard with an `/api/health` route returning
   `{ status: "ok" }`. Example: [Aave health route](../Datum%20Dashboards/aave-dashboard/app/api/health/route.ts).
2. Append a block to `config/dashboards.yaml` with `baseUrl`, `healthPath`,
   and the metrics you care about.
3. `npm run lint:config` to validate.
4. Commit + push. The next cron tick will include it.

Colleague-owned dashboards don't need source access — just the deployed URL
and knowledge of which JSON fields to extract.

## Tuning alerts

The v1 config uses fixed percent thresholds. After a week of data in the
digest, you'll see which metrics are naturally volatile and which are
surprisingly stable — tune the numbers in the YAML. Common follow-ups:

- Add `windowHours: 24` to compare vs a day ago instead of the last 15 min
  (smooths out intraday noise).
- Raise `percentChange` on anything that spams the TG channel.
- Add `absoluteMax` on utilization for *each* pool (v1 only covers pool 0–2
  by index — extend as assets are listed).

## File map

```
datum-monitor/
├── config/dashboards.yaml         # all thresholds and endpoints
├── src/
│   ├── index.ts                   # CLI: check | digest | validate-config
│   ├── config.ts                  # YAML loader + zod validation
│   ├── types.ts                   # Config + Alert + Sample types
│   ├── extract.ts                 # JSON dot-path resolver
│   ├── fetcher.ts                 # HTTP fetch with timeout + latency
│   ├── storage.ts                 # Upstash Redis: snapshots + history
│   ├── check.ts                   # main check loop
│   ├── digest.ts                  # 6h report orchestration
│   ├── render.ts                  # TG (text) + email (HTML) formatting
│   └── notifiers/
│       ├── telegram.ts
│       └── email.ts
├── .github/workflows/
│   ├── monitor-check.yml          # every 15 min
│   ├── monitor-digest.yml         # every 6 hours
│   └── typecheck.yml              # on PR / push
├── .env.example
└── package.json
```
