# Setnel

> Part of [Atlas](https://github.com/DatumLabMHQ/atlas), Datum Labs' internal data infrastructure. Start there for how the parts fit together.

Setnel is the watch. It monitors the Datum data platform and every dashboard built on it, keeps
the history of what each of them reported, raises an incident when something is wrong, pages a
human only when a human needs to act, and each morning writes the content brief from what the
data did overnight.

It is one product with two jobs that share a database. The **risk** side asks whether anything is
broken and tells somebody. The **content** side asks whether anything happened worth writing
about and drafts it. They share a database because both questions are answered from the same
history, and a thing that is both broken and interesting should only be noticed once.

The console is at **https://setnel.datumlab.xyz**, behind a sign-in.

## How it works

```
  a dashboard's own detectors            setnel's own detectors
  (in each dashboard's repo,             (scripts/detectors, for the platform
   on a five-minute cron)                 and for products with no dashboard)
        |                                        |
        +--------------------+-------------------+
                             |
                   POST /api/v1/events           signed with the dashboard's
                             |                   shared secret, HMAC-SHA256
                             v
                    +-----------------+
                    |   the hub       |  Next.js on Vercel, Neon Postgres
                    +-----------------+
                             |
     every event is stored, then collapsed by fingerprint into an incident,
     so a condition that persists is one incident with a count rather than
     a thousand alerts
                             |
        +--------------------+--------------------+
        |                    |                    |
        v                    v                    v
    Telegram              email              the console
   (critical)        (critical, and the      (incidents, detectors,
                      daily brief)            metrics, runbooks)
```

An event carries a message, a fingerprint, a severity and a payload. The fingerprint is the
identity of the thing being reported, so the same condition seen a hundred times becomes one
incident. A reading identical to the one already on the incident never pages again, and an
incident that nobody resolves backs off from hourly to four-hourly to twelve to daily rather
than repeating forever.

## Severity

Critical means money is at risk now and somebody must act within the hour. Everything else is a
warning that goes to the brief and the console without paging.

The full definition, including the three gates a rule passes before it can reach critical, is in
[datum-context/house/severity.md](https://github.com/DatumLabMHQ/datum-context/blob/main/house/severity.md).
It is not optional reading before writing a rule. It was written after a day on which 290
critical alerts were raised and not one of them was real.

## The rules

`rules/` holds one YAML file per content rule: what it reads, at what threshold, how often, who
owns it and whether it is live. Thresholds change there by pull request rather than by a deploy,
and Joel reviews them.

| | |
|---|---|
| Rules in the manifest | 32 |
| Live | 14 |
| Waiting on data the platform does not hold yet | 18 |

`scripts/rules/engine.mjs` runs the live ones and applies the shared noise gates so no rule
re-implements a size floor. `scripts/backtest.mjs` replays any rule over the platform's history
with different thresholds, so a number is chosen from evidence rather than from instinct. Read
[rules/README.md](rules/README.md) before adding one.

## What reports in

Four sources report to the hub today.

| Dashboard | What it watches |
|---|---|
| `platform` | the Datum data platform itself: freshness, job failures, reconciliation against outside references |
| `aave` | the Aave dashboard's own detectors |
| `rwa` | the RWA terminal |
| `sui` | the Sui lending terminal |

Six more are registered and disabled, left over from dashboards that have been replaced or that
belong to clients.

A dashboard owner wires a new one in by following
[hub/docs/ONBOARD_A_DASHBOARD.md](hub/docs/ONBOARD_A_DASHBOARD.md): register the dashboard and a
shared secret, copy the runtime from `hub/templates/` into the dashboard's repo, write detectors
against its own API routes, and set three environment variables. Nothing in this repository needs
to change.

## The timetable

Every job here is dispatched by
[datum-scheduler](https://github.com/DatumLabMHQ/datum-scheduler), because GitHub's own cron
delayed a fifteen-minute schedule to three runs in three days. All times UTC.

| Workflow | When | What |
|---|---|---|
| `setnel-ping` | every 5 minutes | triggers each dashboard's detector run and keeps them warm |
| `setnel-platform` | every 15 minutes | watches the platform's health |
| `setnel-watchdog` | every 15 minutes | watches Setnel, in case the watch itself stops |
| `setnel-rwa` | every 15 minutes at :10 | the RWA terminal's detectors |
| `setnel-resolve` | every 30 minutes at :05 | closes incidents whose condition has cleared |
| `setnel-analyze` | every 30 minutes at :20 | anomaly detection over the metric history |
| `setnel-crosscheck` | hourly at :40 | compares our numbers against outside references |
| `setnel-content` | hourly :25, daily 07:10, Mondays 07:15 | the content rules |
| `setnel-content-digest` | 07:25 | the daily brief, sent only when something fired |
| `setnel-escalation-weekly` | Mondays 08:00 | every critical nobody acknowledged this week |

## Layout

| Path | What |
|---|---|
| `hub/` | the Setnel Hub: the Next.js console, the signed ingest endpoint, the incident logic, the notifiers and the database schema. Its own [README](hub/README.md) covers running it. |
| `rules/` | the content rule manifest, one YAML per rule |
| `scripts/rules/` | the rules engine, the shared noise gates and one module per rule |
| `scripts/detectors/` | Setnel's own detectors for the platform, the RWA terminal and the content signals |
| `scripts/watchdog.mjs` | the outermost check, which pages if the hub stops answering |
| `design-system/` | the Setnel look, shared with the Datum UI kit |
| `config/`, `src/` | the legacy v1 watcher, described below |

## The legacy watcher, and a decision waiting

`src/` and `config/dashboards.yaml` are the original 2026 monitor: a command-line checker that
polls dashboard JSON routes, compares values against thresholds in YAML, keeps its state in
Upstash Redis and sends its own Telegram messages and its own six-hourly digest. It predates the
hub and is not connected to it.

It is still running, on GitHub's own cron, through `monitor-check.yml`, `monitor-digest.yml` and
`monitor-warmup.yml`. As of 22 September 2026 each check reports eight critical technical alerts
out of twenty-three samples, because the dashboards it polls were rebuilt on the Datum standard
and the JSON field paths in the YAML no longer resolve. Those alerts go to the same Telegram
channel as the hub's, from a system nobody is reading.

Three ways to settle it, in the order they are worth considering: retire the v1 watcher now that
the hub covers everything it covered, or repoint its field paths at the rebuilt dashboards if it
is still earning its place, or at minimum turn off its schedules so it stops reporting into a
channel people are trying to trust. This is the only part of the repository that is not doing
what it looks like it is doing, and it deserves a decision rather than another month of drift.

## Running it

The hub:

```bash
cd hub
npm install
cp .env.example .env     # DATABASE_URL, TELEGRAM_*, RESEND_API_KEY, SETNEL_* secrets
npm run db:push          # schema and seed
npm run dev
npm test                 # the incident state machine and the rule gates
```

The rules, against the platform, without sending anything:

```bash
node scripts/rules/engine.mjs --schedule all --dry-run
node scripts/backtest.mjs --rule tvl_wow --since 2025-09-01
```

## Where it runs

| Thing | Where |
|---|---|
| The hub | Vercel, Datum Labs account, project `setnel-hub-datum`, aliased to setnel.datumlab.xyz |
| The database | Neon Postgres, separate from the data platform's |
| Every scheduled job | GitHub Actions, dispatched by datum-scheduler |
| Alerts | Telegram, channel "Setnel by Datum Labs" |
| Email | Resend, from monitor.datumlab.xyz, to the five recipients in `SETNEL_CONTENT_RECIPIENTS` |
| Heartbeats | [setnel-pings](https://github.com/DatumLabMHQ/setnel-pings), a public repo where Actions minutes are free |
