# Setnel Design System — v2

**Setnel — by Datum Labs.** The design system for Setnel, Datum Labs' internal **risk-monitoring console** for DeFi lending dashboards. Setnel watches whether Datum Labs' data dashboards (Aave v3, Sui Lending, Stablecoin Wars, Multichain TVL, Navi, SparkLend, …) are still collecting data, cross-checks their numbers against independent sources, and fires **incidents** when a metric leaves its learned baseline — with a full ops workflow (ack / mute / escalate / resolve), SLA metrics, a coverage map, backtesting, and runbooks.

**v2 rework (this revision).** The first pass invented a blue "control-room" look that read as generic/AI-ish. v2 is grounded in the product's **real `globals.css`** and the direction the team chose: a **structural rework into a dense app-shell** (persistent left sidebar), **refining the real monochrome-institutional aesthetic** to a Linear/Vercel/Datadog bar. Ink-black is the single action color; white page; severity carried by restrained tints; **Geist** as the distinctive UI typeface; data everywhere in mono + tabular.

> Product tagline (live gate): *"Risk monitoring for DeFi lending dashboards. A Datum Labs product."*

## Sources this system was built from
- **GitHub repo:** `Olusegun-Aborode/setnel` (now accessible) — the ground truth. Read in particular: `hub/src/app/globals.css` (the real visual language, mined for every token here), `hub/docs/ROADMAP.md` (the 7-phase product scope → informed the app-shell IA), `hub/src/lib/queries.ts` & `runbooks.ts` (domain vocabulary), `hub/src/app/login/page.tsx`, and the route code under `hub/src/app/(app)/setnel/`. **Explore this repo to build higher-fidelity Setnel work.**
- **Attached codebase** (mounted, read-only): `setnel/` — the console route (`page.tsx`, `metrics/`, `backtest/`, `runbooks/`, `incident/[id]/`, `actions.ts`, `trend-chart.tsx`, `live.tsx`).
- **Live product:** https://setnel-hub.datumlabs.workers.dev/ (auth-gated; only the login gate is public).
- **Logo:** the real Datum Labs mark (`hub/public/logo.png`) is copied into `assets/logo.png` — a periwinkle (#4F6EF2) rounded square with a white interlocking glyph.

---

## CONTENT FUNDAMENTALS — how Setnel writes

Setnel's voice is an **on-call engineer's**: terse, precise, quantified, never hyped. It states what happened, by how much, and against what baseline.

- **Casing:** Sentence case for prose and buttons ("Acknowledge", "Mute 1h", "False positive"). Severity/status words are **lowercase in prose** but render **UPPERCASE inside badges** (the `Badge` component owns that transform). KPI micro-labels are UPPERCASE with wide tracking ("ACTIVE INCIDENTS").
- **Person:** Impersonal / system-voice. No "you", no "we". The subject is the metric or dashboard: *"Collection stalled — no samples in 47 minutes."* Actor names attach to actions ("ack by olusegun").
- **Numbers are the message.** Copy leads with the quantified move and the baseline it broke: *"USDC utilization spiked to 94.2% — 8.1pt above its 30-day mean."* Deltas use `pt`, `%`, `z=+3.4`, `×6`, `$1.2M at risk`. Always give the comparison.
- **Time is relative + mono.** "3m ago", "31h ago", "opened Jul 05 · 13:41".
- **Notes / activity are human and short.** *"Watching — if util crosses 96% we page the on-call."* System notes are matter-of-fact: "Acknowledged", "Muted for 60 min".
- **Panel notes explain the method, tersely.** *"grey band = normal range (mean ±2σ)"*, *"replaying |z|>3 & move>8% over stored history · red = would have fired"*.
- **Emoji:** none. The real product uses none in the console chrome. Status is carried by colored dots, pills, and heat cells — never emoji.
- **Vibe:** trustworthy instrumentation — Grafana / Sentry / a NOC wallboard, not a consumer SaaS page. If a sentence could appear in a pitch deck, rewrite it.

---

## VISUAL FOUNDATIONS

**Overall motif — "institutional monitor."** A bright white workspace with a **persistent left sidebar** (app shell) and a slim content topbar. Structure is carried by hairlines, not chrome. Dense but calm. This is the *real* Setnel aesthetic, refined — not reinvented.

- **Color.** Monochrome-forward. Text ramp: ink `#0A0A0A` → ink-2 `#3F4651` → muted `#6B7280` → faint `#9AA3AF`. Surfaces: white `panel`, `panel-2 #F7F8F9` (sunken washes, SLA strip, seg track), `panel-3 #F0F2F4` (hover / active nav). Hairlines: `border #E5E7EB`, `border-strong #D1D5DB`. **Ink black is the one action color** — primary buttons, active nav, active chips are solid ink; there is no blue "primary". Severity is a four-step signal, each shown as a ~10–12% tint of its hue: info `#2563EB`, warning `#B45309`, critical `#DC2626`, emergency `#B91C1C`. Collection heat is a green ramp `#EDEEF1 → #C6E6CF → #74C08A → #1F9D57`. Brand blue `#4F6EF2` lives **only** in the logo. A fixed 10-color series palette drives multi-line charts.
- **Type.** **Geist** (UI) + **Geist Mono** (all data). The live app ships the system stack; Geist is the deliberate v2 upgrade — institutional, precise, superb tabular figures. Everything numeric is mono + tabular: metric values, detector IDs, metric keys, timestamps, counts, exposure. Scale mirrors the app: 13–15px body, 11px uppercase micro-labels (0.06em), 26px bold KPI values, section headings 15px/650 at −0.01em.
- **Spacing & layout.** 4px grid. **App shell:** 216px sidebar (`--sidebar-w`), 52px content topbar (`--topbar-h`), 1280px content rail (`--content-max`), 16px panel gaps. Sidebar and content scroll independently. Very dense — maximize signal per screen.
- **Corners.** From the app: 5px badges, 6–7px controls, 8px base (inputs/KPIs), 10px panels, 12px cards, pill chips. Tight and precise.
- **Borders & cards.** Hairline-first. Cards = white + 1px `border` + 8–10px radius, **no resting shadow**. Incident cards add a **3px left severity rule** (the one earned "colored-left-border" pattern — severity is the card's primary axis). KPI tiles are plain bordered cards; tone tints the *value*, not a rule.
- **Shadows.** Restrained, cool, low-opacity. Reserved for floating things: the segmented-control thumb (`shadow-seg`), the login card (`shadow-card` = `0 1px 2px / 0 8px 24px` at 4%), popovers/toasts (`shadow-pop`). Resting surfaces use borders.
- **Backgrounds.** Flat white only. **No gradients, no images, no textures, no illustration.** Data is the decoration — charts, heat cells, dots, sparklines.
- **Transparency & blur.** Minimal. Severity tints are rgba fills at 10–12%; the mobile phone preview scrim is ink at 45%. No glassmorphism, no backdrop blur.
- **Animation.** One signature motion, taken from the app: the **live-refresh pulse** (green dot, `opacity 1 → 0.3`, 2s ease-in-out). Otherwise fast, functional transitions (90–200ms, `cubic-bezier(0.2,0,0,1)`); content does not animate on load. Respects `prefers-reduced-motion`.
- **Hover states.** Subtle. Outline buttons darken their border to ink; ghost buttons gain a `panel-3` fill; nav items fill `panel-3`; chips darken border + text to ink. Links use the muted→ink shift, not underlines, except inline text links.
- **Press / active states.** Primary buttons darken ink → `#232323`. The filter **Chip** and active **NavItem** invert/fill to solid ink / panel-3. No scale-shrink.
- **Focus.** Visible, institutional: a 2px white gap + ink ring (`--focus-ring`); danger controls get a red ring. Not a colored glow.
- **Inputs.** White, `border-strong`, focus **darkens the border to ink** (no ring fill) — exactly the app's behavior.

---

## ICONOGRAPHY

- **Sidebar icons: Lucide** (https://lucide.dev, CDN). The real product ships **no icon set** — its console is glyph-and-color driven. The v2 app-shell needs nav icons, so Lucide is the deliberate substitution: 1.5px stroke, geometric, non-filled — matching the institutional feel. Icons used: `layout-dashboard`, `siren`, `activity`, `grid-3x3`, `history`, `book-open`, `log-out`, `arrow-left`, `smartphone`. **Flagged as an addition** — swap for a licensed set if the team standardizes one.
- **Everything else stays icon-light**, as in the source: status **dots**, collection **heat cells**, severity **pills**, and **sparklines** carry meaning. Unicode arrows are retained verbatim: `→` (details / see all), `↗` (open external dashboard), `←`/`arrow-left` (back).
- **Emoji:** none.
- **Logo:** the real Datum Labs mark is in `assets/logo.png` (and `ui_kits/console/logo.png` for the kit). Use it directly; do not recolor or reconstruct it.

---

## Components

Reusable React primitives, grouped by concern. Import from the namespace: `const { Button } = window.SetnelDesignSystem_525d6e`. Styling is via the design-system CSS custom properties (each component injects one `<style>` block on load). Inventory is grounded in the app's real className vocabulary; app-shell pieces are marked as intentional additions.

**forms/**
- **Button** — ink-primary / white-outline secondary / ghost / danger; `sm`/`md`/`lg`; `as="a"`.
- **Input** — text field (actor, notes, login); `mono`, `invalid`, `size="lg"`; focus darkens border to ink.
- **SegmentedControl** — the trend-chart breakdown switcher (sunken track, raised active thumb).
- **Chip** — incident-feed toggle filter; active inverts to solid ink.
- **Switch** — toggle a boolean (detector enable/disable, density, channels).
- **Checkbox** — row selection for bulk actions + multi-select (supports indeterminate).
- **TimeRange** — the global range picker (1h/24h/7d/30d) every chart + feed respects.

**overlay/**
- **Menu** (+ `MenuItem` / `MenuLabel` / `MenuSeparator`) — dropdown for mute-with-reason, bulk actions, row overflow.

**feedback/**
- **Badge** — uppercase rectangular pill; severity (info/warning/critical/emergency) + neutral (resolved/exposure/count).
- **StatusDot** — dashboard health; **shape-coded** (circle/diamond/square/ring) for colorblind safety, not hue alone.
- **LiveIndicator** — the auto-refresh toggle (ghost button, pulsing green dot when live).
- **NowPill** — the persistent global "is anything on fire right now?" header indicator (`nowLevel()` helper).

**data/**
- **StatCard** — KPI tile; tone tints the value (good/warn/bad).
- **Panel** — the section container (title + note + `aside`; `flush`, `divided`).
- **HeatStrip** — row of 0–3 collection-heat cells (`heatLevel()` helper).
- **Sparkline** — compact metric line with optional normal-range band, dashed mean, fire markers.
- **MetricCard** — a Metrics-explorer tile: key + value + banded `Sparkline` (value reddens out of band).
- **MetricChart** — the interactive detail chart: crosshair tooltip, **inline detector threshold line**, band, mean, fired markers, responsive.
- **CoverageTable** — the risk-type × protocol coverage matrix (yes / blocked / planned / na).

**navigation/**
- **Sidebar** + **SidebarSection** — the app-shell left rail (brand, labelled nav groups, footer).
- **NavItem** — a sidebar row (icon + label, active/hover, optional count/dot).
- **CommandPalette** — the ⌘K navigator over dashboards, detectors, incidents, metrics, and actions.

### Intentional additions (not in the source's console today)
- **Sidebar / SidebarSection / NavItem** — the v2 structural rework replaces the app's top-nav links with a persistent left sidebar. Requested by the team; the source has no sidebar.
- **Lucide** icon dependency — see ICONOGRAPHY.
- **MetricCard** / **CoverageTable** formalize the app's existing `.metric-card` and `.cov-table` markup as components.

## UI kit
- **`ui_kits/console/`** — the v2 app-shell recreation of the full product. **Login → app shell (sidebar + topbar)** with the persistent **NowPill** ("is anything on fire?"), **TimeRange**, **⌘K command palette**, **wallboard** launch, and **density toggle** — then:
  - **Console** — KPIs, SLA, trends, health matrix, incident preview.
  - **Incidents** — filter + **bulk select** (ack/mute), **mute-with-reason** menu, **keyboard ops** (j/k/a/m/↵), designed **empty states**.
  - **Incident detail** — the **"why it fired"** evidence panel (rule, baseline, z-score, **cross-source confirmation**), interactive **MetricChart** with the inline trigger line, runbook, activity.
  - **Dashboards** → **per-dashboard drill-down** (metrics, incidents, detectors, collection).
  - **Detectors** → **detector config** with live **tune-from-backtest** (drag thresholds, watch the would-fire count).
  - **Metrics**, **Coverage** (actionable — click a blind spot → propose a detector), **Backtest**, **Reports** (MTTA/MTTR, FP-rate, noisiest detectors), **Escalation & on-call**, **Settings**, **Inbox / audit log**.
  - **Wallboard** — read-only dark NOC/TV mode. **Mobile** — phone at-a-glance. See its `README.md`.

### Audit-driven additions (v2.1)
This kit implements a full product-design audit — global now-state, time range, ⌘K, per-dashboard pages, detector config, incident evidence/provenance, escalation, reports, inbox/audit, wallboard, bulk actions, mute-with-reason, keyboard ops, empty states, colorblind-safe status, actionable coverage, and interactive charts with inline thresholds. New primitives added to support these: `Switch`, `Checkbox`, `TimeRange`, `Menu`, `NowPill`, `MetricChart`, `CommandPalette`.

## Foundation cards (Design System tab)
`guidelines/cards/` — grouped **Colors** (ink, surfaces, severity, status/heat, series), **Type** (display, body, mono), **Spacing** (scale, radii/elevation), **Brand** (wordmark lockup, live/motion).

---

## Index / manifest
- `styles.css` — the one file consumers link (imports-only).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `motion.css`, `base.css`.
- `components/{forms,feedback,data,navigation,overlay}/` — 23 primitives.
- `guidelines/cards/` — foundation specimen cards.
- `ui_kits/console/` — the interactive app-shell recreation.
- `assets/logo.png` — the real Datum Labs mark.
- `SKILL.md` — Agent-Skills entry point. · `readme.md` — this file.

---

## CAVEATS & OPEN QUESTIONS

- 🟠 **Geist is a deliberate substitution, loaded from Google Fonts.** The live app uses the system stack; the team asked for a distinctive UI typeface and Geist fits the Linear/Vercel bar. Say the word if you'd rather keep the system stack or use licensed brand fonts, and I'll swap the `@font-face` closure.
- 🟠 **Lucide is a substituted icon set** for the new sidebar (the product ships none). Swap if you standardize on another.
- 🟡 **App-shell IA is a proposal.** The sidebar groups (Monitor / Analyze / Respond) and the Console-vs-Incidents split are my read of the roadmap. Tell me if the grouping or the default landing view should change.
- 🟡 **Escalation policy & named-users** (roadmap Phase 5) and **cross-source provenance** on incident cards (Phase 2) are represented lightly — I can build dedicated surfaces for them if they matter for this system.

### 👉 Your move
This v2 is grounded in the real code and your chosen direction (monochrome-institutional, app-shell, Geist, dense). **Two asks to lock it in:** (1) confirm **Geist + Lucide** or hand me the fonts/icon set you'd rather use; (2) tell me if the **sidebar IA** (Monitor / Analyze / Respond, and Console as the landing view) is right — or how you'd regroup it. I'll tighten from there.
