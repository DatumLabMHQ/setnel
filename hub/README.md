# Setnel — by Datum Labs

Risk monitoring for DeFi lending dashboards. Each dashboard runs its own
detectors on a 5-minute cron and posts findings to the **Setnel Hub**, which
stores history, deduplicates, routes alerts to Telegram, and renders a private
console at **https://setnel-hub.datumlabs.workers.dev**.

> This `hub/` directory is the Setnel Hub app. The repo root also holds the
> legacy `datum-monitor` v1 scripts + the shared GitHub Actions heartbeat
> (`.github/workflows/setnel-ping.yml`) that pings each dashboard's cron.

## Layout

```
hub/
├── src/app/                  Next.js app (App Router)
│   ├── (app)/setnel/         the private console (KPIs, health chart, incidents)
│   ├── login/                shared-password gate
│   └── api/v1/events/        signed ingest endpoint
├── src/lib/                  db, ingest+dedup, notify (Telegram), queries, auth
├── db/                       schema.sql + seed.sql + push.ts
├── docs/ONBOARD_A_DASHBOARD.md   how a dashboard owner wires their dashboard in
└── templates/                copy-paste runtime + detector example + cron route
```

## Run locally

```bash
cd hub
npm install
cp .env.example .env   # fill in DATABASE_URL, TELEGRAM_*, SETNEL_PASSWORD, secrets
npm run db:push        # apply schema + seed
npm run dev
```

## Deploy

Hosted on Cloudflare Workers (Datum Labs account) as the Worker `setnel-hub`, built with
[vinext](https://github.com/cloudflare/vinext): https://setnel-hub.datumlabs.workers.dev.
`setnel-hub.datumlabs.workers.dev` still points at the old Vercel project until its DNS is moved to the Worker.

```bash
npm run build     # vite build
npm start         # vite preview: the built Worker locally (use --port, not -p)
npm run deploy    # vinext-cloudflare deploy (cf CLI must be logged in to the Datum Labs account)
```

`npm run dev:next` / `npm run build:next` still run plain Next.js.
Plain settings live in `cloudflare.config.ts`; secrets are Worker secrets
(`npx cf workers secrets update <NAME> --worker setnel-hub --type secret_text --text <value>`
or the Cloudflare dashboard), never committed.

## Onboarding a new dashboard

See [docs/ONBOARD_A_DASHBOARD.md](docs/ONBOARD_A_DASHBOARD.md). Short version:
register the dashboard + a shared secret on the Hub, the owner copies the
`templates/` files into their repo and writes detectors, sets 3 env vars,
deploys, and sends their cron URL to add to the heartbeat.

## Monitored today

- **Aave V3** — 10 detectors
- **State of SUI** — 6 detectors across 5 Sui lending protocols (Navi, Suilend,
  Scallop, AlphaLend, Bucket)

## Email via Onchain Suite

The hub sends email through Onchain Suite (Datum's messaging product), not a transactional mail API.
It posts a custom event per recipient; an automation in the Onchain Suite dashboard turns the event
into the email. Nothing is sent until that automation exists, is active and is published.

Env on the hub: `ONCHAINSUITE_SECRET_KEY` (server-side secret key). `RESEND_API_KEY` + `SETNEL_EMAIL_FROM`
remain as the legacy fallback when the Onchain Suite key is absent.

Event the hub sends: `setnel_incident`, contact by email, payload:

| key | example |
|---|---|
| `subject` | `🚨 CRITICAL • State of SUI` |
| `dashboard` | `State of SUI` |
| `severity` | `critical` |
| `severity_label` | `🚨 CRITICAL` |
| `message` | `NAVI USDC utilization crossed 95%` |
| `link` | `https://setnel-hub.datumlabs.workers.dev/setnel/incident/123` |
| `incident_id` | `123` |

Automation recipe (Onchain Suite dashboard): trigger `app_event`, event name `setnel_incident`, then a
`send_email` step pointed at a template whose subject is `{{ event.subject | default:'Setnel alert' }}`
and whose body uses `{{ event.severity_label | default:'Alert' }}`, `{{ event.dashboard | default:'Setnel' }}`,
`{{ event.message | default:'' }}` and `{{ event.link | default:'https://setnel-hub.datumlabs.workers.dev' }}`.
Every variable needs a `default` filter or Onchain Suite refuses to launch the template.

Idempotency: one key per incident, recipient and 10-minute bucket, so retries never double-send.
Their queue rejects keys containing `:`; the helper strips them.
