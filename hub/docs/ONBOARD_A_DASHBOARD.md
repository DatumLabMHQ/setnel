# Wiring a dashboard into Setnel

**Setnel** is Datum Labs' risk-monitoring product. Each dashboard runs its own
alert rules ("detectors") on a 5-minute cron and posts findings to the **Setnel
Hub** (`https://setnel-hub.datumlabs.workers.dev`), which stores history, deduplicates, fires
Telegram, and shows everything on the private console.

This guide is for a dashboard **owner** (e.g. wiring SparkLend, Lending
Intelligence Terminal, or Liquidator Economy from your own machine).

> Works for any Next.js dashboard that has API routes (a server runtime) and a
> public data API the detectors can read. Pure static (HTML+CDN) dashboards
> can't run detectors in-app — tell the Setnel maintainer and they'll monitor it
> centrally instead.

---

## The model (1 minute)

```
Your dashboard repo                          Setnel Hub (we run this)
┌───────────────────────────┐                ┌─────────────────────────┐
│ lib/setnel/detectors.ts    │  POST signed   │ /api/v1/events          │
│   ← your alert rules        │  events every  │  store + dedup + route  │
│ lib/setnel/runtime.ts       │  5 min         │  → Telegram + console   │
│ app/api/setnel/cron/route.ts├───────────────▶│                         │
└───────────────────────────┘                └─────────────────────────┘
        ▲ pinged every 5 min by GitHub Actions (we add your URL)
```

You write the **detectors**. Everything else is copy-paste.

---

## Step 1 — Ask the Setnel maintainer for two things

Message whoever runs Setnel (the Hub repo owner). Give them:

- A short **dashboard id** (lowercase, e.g. `sparklend`)
- A display **name** (e.g. `Spark Lend`)
- Your dashboard's **public URL** (e.g. `https://sparklend-dashboard.vercel.app`)

They will:
1. Register your dashboard in the Hub database.
2. Generate a **shared secret** and add it to the Hub as
   `SETNEL_DASHBOARD_SECRET_<ID>`.
3. Send you that secret (one value — treat it like a password).

You can't authenticate to the Hub without this, so do this first.

---

## Step 2 — Add three files to your repo

Copy these from `setnel-hub/templates/` (in the Setnel repo):

| Copy this template | To this path in your repo |
|---|---|
| `templates/runtime.ts` | `lib/setnel/runtime.ts` (or `src/lib/setnel/runtime.ts`) |
| `templates/detectors.example.ts` | `lib/setnel/detectors.ts` — then rewrite the rules for your protocol |
| `templates/cron-route.ts` | `app/api/setnel/cron/route.ts` (or under `src/app/...`) |

- `runtime.ts` — **don't edit.** It's the engine that runs detectors and posts to the Hub.
- `cron-route.ts` — set `DASHBOARD_ID` to the id from Step 1. Fix the relative
  `import '../../../../lib/setnel/detectors'` depth if your folder layout differs.
- `detectors.ts` — **this is your work.** Delete the examples, write real rules
  against your dashboard's API. See the examples and the reference below.

---

## Step 3 — Write your detectors

A detector = one rule. It fetches data from your own API and returns events.

```ts
defineDetector({
  id: 'sparklend.usdc-utilization',     // unique within your dashboard
  label: 'USDC utilization above 90%',
  category: 'liquidity',                 // see categories below
  severity: 'critical',                  // info | warning | critical | emergency
  link: undefined,                       // (optional)
  source: async () => (await fetch(`${baseUrl()}/api/markets/USDC`)).json(),
  detect: (m) => m.utilization > 90 ? [{
    message: `USDC utilization at ${m.utilization.toFixed(1)}%`,
    fingerprint: 'sparklend.usdc-utilization',  // stable dedup key
    linkPath: '/markets/USDC',                   // deep link in YOUR dashboard
    payload: { utilization: m.utilization },
  }] : [],
});
```

**Categories** (pick one per detector):
`liquidity` · `liquidations` · `flows` · `risk-parameters` · `oracles` ·
`governance` · `revenue` · `whale-activity` · `depegging` · `technical`

**Severity → where it goes:**

| Severity | Telegram (live) | Email digest (12h) | Notes |
|---|---|---|---|
| `info` | no | no | logged only |
| `warning` | no | yes | |
| `critical` | yes | yes | |
| `emergency` | yes (🚨) | yes | active exploit / depeg only |

> `technical`-category alerts never go to Telegram — they're batched into the
> email digest, so infra blips don't spam the channel.

**Fingerprints** are the dedup key. The same fingerprint while active collapses
into one incident (it won't re-spam). Put the asset/pool in it so distinct
breaches stay separate, e.g. `sparklend.utilization:USDC` vs `:WETH`.

Three worked patterns (absolute threshold, per-item loop, change-over-time) are
in `templates/detectors.example.ts`.

---

## Step 4 — Set three environment variables on your Vercel project

```
SETNEL_HUB_URL   = https://setnel-hub.datumlabs.workers.dev
SETNEL_SECRET    = <the shared secret from Step 1>
SETNEL_SELF_URL  = https://<your-dashboard>.vercel.app
```

- `SETNEL_SELF_URL` is how detectors call your own API. Use the **public**
  production URL (not the per-deployment `*-xxxxx.vercel.app` URL — those are
  protected and return an HTML auth page). If your app uses a Next.js
  `basePath`, append it (e.g. `https://x.vercel.app/navi`).

Set them for Production (and Preview/Development if you want), then **redeploy**
so they take effect.

---

## Step 5 — Test

After deploying, hit your cron route in a browser or curl:

```
curl https://<your-dashboard>.vercel.app/api/setnel/cron
```

A healthy response looks like:

```json
{ "ran": 5, "events": 0, "errors": [], "hub": { "ok": true, "stored": 0 } }
```

- `ran` = how many detectors executed
- `events` = how many fired this run (0 is fine — means nothing's wrong)
- `errors: []` = good. If you see `"<!doctype ..."` errors, your `SETNEL_SELF_URL`
  is pointing at a protected URL — fix it to the public one (Step 4).
- `hub.ok: true` = the Hub accepted it. `401 bad signature` = wrong
  `SETNEL_SECRET`. `404` = id not registered (Step 1).

---

## Step 6 — Tell the maintainer your cron URL

Send them `https://<your-dashboard>.vercel.app/api/setnel/cron`. They add it to
the 5-minute heartbeat (`setnel-ping.yml`). Done — your dashboard now shows up in
the Setnel console health matrix and fires alerts to Telegram.

> Vercel's free (Hobby) plan caps native cron at once/day, which is why the
> 5-minute cadence runs from a shared GitHub Actions heartbeat instead. You can
> optionally add a daily `vercel.json` cron as a backstop, but it's not required.

---

## Data your API should expose for the advanced (Phase 4) detectors

The basic detectors work off TVL / utilization / borrows. The high-value risk
primitives need specific fields. Expose these from your API and the matching
detector becomes possible (copy the pattern from the Aave detectors):

| Detector | Needs your API to expose |
|---|---|
| **Stablecoin depeg** | per-asset price (the price your protocol reads), per reserve/pool |
| **Oracle deviation** | per-asset price + token **address** + chain (so we compare to DeFiLlama by address) |
| **Bad debt** | per-wallet/position **health factor** (positions with HF < 1) |
| **At-risk liquidations** | per-position collateral $ + current HF or distance to liquidation threshold |
| **Wallet concentration** | top borrowers/suppliers with their $ amounts |

If your endpoints don't expose these yet, add the fields — usually already
available from your indexer/SDK, just not surfaced. Until then those detectors
are simply skipped (never fabricated data).

Set `payload.exposureUsd` on any event where you know the dollars at risk
(a pool's supply, a market's TVL) — the console ranks the feed by it.

A note on metric samples: add a `sample(data)` function to a detector to report
metric values every run (see Aave/SUI). This feeds the Hub's time-series, which
powers adaptive anomaly detection, cross-source verification, and charts — your
dashboard gets those for free once it's sampling.

## What the maintainer does on their end (reference)

1. `INSERT` the dashboard row + `SETNEL_DASHBOARD_SECRET_<ID>` on the Hub, redeploy Hub.
2. Add the cron URL to `setnel-ping.yml`.
3. Confirm the dashboard appears in the console health matrix.
