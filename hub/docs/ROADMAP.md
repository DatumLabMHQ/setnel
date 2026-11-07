# Setnel Roadmap — from MVP to institutional-grade

Status: **✅ COMPLETE — all 7 phases shipped & live at setnel-hub.datumlabs.workers.dev.**
Sequenced so each phase shipped standalone value and unblocked the next.
Effort buckets: **S** = a few days · **M** = ~1 week · **L** = 2-3 weeks.

## Completion snapshot

| Phase | Theme | Status |
|---|---|---|
| 1 | Foundations & reliability | ✅ metric store · retry/dead-letter · watchdog · tests |
| 2 | Data trust (cross-source) | ✅ DeFiLlama divergence checks (hourly) |
| 3 | Smarter detection | ✅ adaptive z-score anomalies · exposure weighting · compound rules |
| 4 | Core risk primitives | ✅ depeg + oracle deviation; bad-debt / at-risk / wallet-concentration documented as data-gated (see ONBOARD_A_DASHBOARD.md) |
| 5 | Operational workflow | ✅ ack/mute/false-positive/notes · escalation · drill-down · SLA |
| 6 | Console polish | ✅ live refresh · metrics explorer (baseline bands) · detector mute · mobile |
| 7 | Tuning & coverage | ✅ backtest · coverage map · runbooks |

Live workflows: `setnel-ping` (5m) · `setnel-analyze` (30m) · `setnel-crosscheck` (1h) · `setnel-watchdog` (15m).
Wired dashboards: Aave V3 (12 detectors), State of SUI (6 detectors / 5 protocols).

Remaining (non-roadmap, tracked elsewhere): rotate Neon password; onboard the
3 colleague dashboards; unlock data-gated primitives when dashboards expose
per-wallet health factors / per-asset prices.

The sections below are the original plan, kept for reference.

Guiding principle: **trust, then signal, then workflow.** A risk tool is only
worth acting on if (a) the data is verified, (b) the detection is meaningful,
(c) a human can actually act and never miss a critical.

---

## The keystone: a metric time-series store

Most upgrades below need something we don't store yet — the **actual metric
values over time** (today we only store incidents, events, and heartbeats).
This one table unblocks adaptive thresholds, drill-down charts, exposure
weighting, cross-source checks, and backtesting. Build it first.

```sql
CREATE TABLE metric_samples (
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  metric_key   TEXT NOT NULL,        -- e.g. 'aave.tvl', 'sui.navi.util.wUSDT'
  value        DOUBLE PRECISION NOT NULL,
  source       TEXT NOT NULL DEFAULT 'dashboard',  -- 'dashboard' | 'defillama' | 'chain'
  ts           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX metric_samples_key_ts ON metric_samples (dashboard_id, metric_key, ts DESC);
```

The detector runtime emits samples alongside events every run. Retention:
downsample > 90 days to daily. This is Phase 1.

---

## Phase overview

| Phase | Theme | Effort | Unlocks |
|---|---|---|---|
| 1 | Foundations & reliability | M | metric store, never-miss delivery, self-monitoring |
| 2 | Data trust (cross-source) | M | catch wrong-data bugs (the SparkLend class) |
| 3 | Smarter detection | M | adaptive thresholds, exposure-weighting, compound rules |
| 4 | Core risk primitives | L | bad debt, at-risk liquidations, oracle deviation, depeg |
| 5 | Operational workflow (UI) | L | ack/mute/escalate, incident drill-down, SLA metrics |
| 6 | Console polish | M | live updates, per-metric charts, alert grouping, mobile |
| 7 | Tuning & coverage | M | backtesting, coverage map, runbooks |

---

## Phase 1 — Foundations & reliability (M)

Enablers + close the scariest failure modes.

- **Metric samples store** (schema above). Runtime emits samples each run; Hub
  persists. Downsampling job for retention.
- **Meta-monitoring / dead-man's-switch.** A separate watcher that alerts if
  Setnel itself goes quiet (no ingest in N minutes) or the GitHub Actions
  heartbeat stops. *Who watches the watcher* — today nothing does; if the
  heartbeat dies, alerts silently stop. Run this from an independent place
  (e.g. an Upstash QStash schedule or a second GH repo) so it can't fail with
  the thing it watches.
- **Delivery retry + dead-letter.** Wrap Telegram/email sends in retry; on
  final failure, write to a `failed_notifications` table and surface on the
  console. Critical alerts must never be silently lost.
- **Detector test harness.** Unit tests: known-bad input → expected event;
  known-good → no event. Runs in CI. Protects against silent rule breakage.
- **Secrets hygiene.** Rotate the Neon password (pasted in chat earlier), move
  to per-environment secrets, document rotation.

**Ships:** a system that records what it sees and can't fail silently.

---

## Phase 2 — Data trust: cross-source verification (M)

The highest-leverage gap. We have direct evidence it's needed (the SparkLend
`/api/markets` 96%-vs-79% incident: Setnel reported the dashboard's wrong
number).

- **Independent source connectors:** DeFiLlama (TVL/borrows), chain RPC or
  subgraph (per-reserve), CoinGecko (prices). Reuse `@datumlabs/data-connectors`
  where possible.
- **Divergence detector:** for each key metric, compare the dashboard's value
  vs the independent source. If they diverge > threshold (e.g. 5%), fire a
  `data-integrity` alert naming both values. This catches dashboard bugs,
  stale caches, and indexer drift.
- **Provenance on incidents:** show which source(s) a value came from and the
  cross-check result on the incident card.

**Ships:** you can trust the numbers — and you're told when a dashboard can't be.

---

## Phase 3 — Smarter detection (M)

Move from "surface thresholds" to "meaningful signal." Built on the metric store.

- **Adaptive thresholds / baselining.** Replace fixed percents with rolling
  z-scores (">3σ from the 7-day mean") per metric. Cuts noise on volatile
  metrics, catches slow bleeds on stable ones. Keep fixed bounds as hard
  floors/ceilings (e.g. util > 95% always critical).
- **Exposure-weighted severity.** Scale severity by dollars at risk, not just
  threshold crossed. Util > 90% on a $1M pool ≠ on a $500M pool. Sort the feed
  by $ exposure.
- **Compound / correlated detectors.** A rule combinator: "if util-spike AND
  oracle-stale within 15 min → escalate to emergency." The dangerous moments
  are combinations, not single metrics.

**Ships:** fewer false alarms, and the alerts that fire are ranked by what matters.

---

## Phase 4 — Core risk primitives (L)

What a lending-risk desk is actually paid to watch. Each needs the underlying
data exposed by the dashboard's API — **dependency: some require the dashboard
owner (incl. colleague's) to expose new fields.** Track per-dashboard.

- **Bad debt / underwater positions** — positions with health factor < 1 not
  yet liquidated. The single most important lending signal. (Needs per-wallet
  HF data.)
- **At-risk liquidation pipeline** — $ of collateral within X% of its
  liquidation threshold. The *leading* indicator (we only have lagging
  liquidations today).
- **Oracle price deviation** — oracle price vs market price beyond N bps.
  (SUI data-health gives staleness; this adds deviation.)
- **Stablecoin depeg** — protocol's stable holdings vs $1 peg beyond 0.5%.
  (Category exists; detector unwired.)
- **Per-wallet collateral concentration** — one wallet > N% of a reserve
  (we have asset-level HHI, not wallet-level).

**Ships:** detection that maps to real systemic risk, not just dashboard KPIs.

---

## Phase 5 — Operational workflow (L)

Turn the noticeboard into an ops tool. This is where "we can't be on the
dashboard every day" actually gets solved.

- **Lightweight named users.** Enough identity to attribute actions + per-person
  notification prefs (replaces the single shared password for the console;
  keep shared password as a fallback if desired).
- **Incident actions:** acknowledge ("I'm on it"), assign, snooze/mute, add
  note, mark false-positive. Stop auto-resolving silently — resolution becomes
  a tracked event.
- **Escalation policy.** Unacknowledged critical → re-notify at intervals →
  escalate (phone/PagerDuty). Today a 3am critical with nobody watching = nothing.
- **Incident drill-down view.** Click an incident → event timeline, the metric's
  chart around the event, payload, notify history, cross-check result, ack trail.
- **SLA metrics.** Time-to-ack, time-to-resolve, false-positive rate per
  detector. You can't tune what you don't measure.

**Ships:** a team can run on Setnel — every critical gets seen and acted on.

---

## Phase 6 — Console polish (M)

- **Live updates** — poll or SSE so the console refreshes itself (today you
  reload to see new state).
- **Per-protocol metric charts** — drill into actual TVL/util/borrows curves
  with the alert thresholds drawn on them (today the chart is meta:
  collection/alerts, not the underlying metrics).
- **Alert grouping / fatigue control** — collapse related alerts, mute a noisy
  detector, on-page digest.
- **Mobile status view** — risk happens off-hours; a phone-friendly at-a-glance
  status + the existing Telegram deep-links.

**Ships:** a console that's pleasant to live in and reads at a glance.

---

## Phase 7 — Tuning & coverage (M)

- **Backtesting** — replay stored metric history against detector rules:
  "would this threshold have caught the last exploit?" Tune with evidence.
- **Detector coverage map** — a matrix of risk-type × protocol showing what's
  covered vs blind (e.g. "Aave: bad-debt ❌, oracle-deviation ❌"). Know your gaps.
- **Runbooks** — each detector links to "what to do when this fires." Turns an
  alert into an action.

**Ships:** confidence that the rules are right and the coverage is known.

---

## Cross-cutting (every phase)

- **Tests** for new detectors + Hub logic.
- **Infra checkpoint:** the current stack (Vercel Hobby cron, Neon free, GH
  Actions heartbeat) has known ceilings. Re-evaluate at Phase 4-5 — likely move
  cron to QStash/a small worker and Neon to a paid tier.
- **Docs:** keep `ONBOARD_A_DASHBOARD.md` current as the detector API evolves.

---

## Build-order rationale & suggested first sprint

Front-load the three highest-leverage items, but Phase 1 foundations come first
because they unblock everything:

1. **Phase 1** (metric store + dead-man's-switch + retry) — keystone + removes
   silent-failure risk.
2. **Phase 2** (cross-source verification) — the gap we have direct evidence for.
3. **Phase 5 partial** (ack + escalate) — make criticals impossible to miss.

Then 3 (smarter detection) → 4 (primitives) → 6 (polish) → 7 (tuning).

Rough total: ~3-4 months of focused work, but each phase is independently
shippable and useful on its own.

---

## Dependencies & risks

- **Dashboard data availability.** Phase 4 primitives need dashboards to expose
  per-wallet HF, oracle prices, caps, etc. Some require the dashboard owner
  (including your colleague's three) to add fields. Sequence per-dashboard.
- **Infra ceilings.** Hobby cron already forced the GH Actions workaround;
  Phase 5 escalation + live updates may need a real worker + paid DB.
- **Scope.** This is the full vision. Each phase is a decision point — ship,
  measure, decide whether the next phase earns its cost.
