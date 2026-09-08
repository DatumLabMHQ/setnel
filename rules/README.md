# Setnel rules (the manifest)

One YAML file per rule. This folder is the contract: what can fire, on what data, at what threshold,
how often, and who owns it. Thresholds change here by pull request (reviewer: Joel), never by a deploy.
`scripts/rules/engine.mjs` runs the live rules; `scripts/backtest.mjs` replays any rule over the
platform's history so a threshold is chosen from evidence.

```yaml
id: tvl_wow                # must equal the file name; the module lives at scripts/rules/rules/<id>.mjs
owner: joel                # who answers for false positives
product: all               # product or 'all'
schedule: daily            # hourly | daily | weekly (hourly runs at :25 after the platform's hourly build)
status: live               # live | waiting | off   (waiting: data or history not there yet, see needs)
description: ...           # one sentence, plain, what fired and why
origin: lending-intelligence-terminal/alerts   # where the rule came from, when ported
source: ref.raw_defillama_tvl                  # the platform table it reads
needs: ...                 # only for waiting rules: what has to exist first
cooldown_hours: 168        # the hub stores one signal per fingerprint per cooldown window
severity: info             # info goes to the daily brief; warning and critical are emailed at once
params: { ... }            # thresholds the module reads as ctx.params
gates: { min_usd, nonzero_prior, min_units_pct }   # shared noise gates the engine applies to every event
```

Rules of thumb, from Joel's handbook section 7:
- Gate on absolute size before a percentage. A percentage on a tiny base is noise by construction.
- Measure flows in token units where the table has them; USD moves with the market. Set `min_units_pct`.
- The fingerprint (`subject` in the module) names every dimension the reader would call a separate event,
  and the threshold when several can be crossed, and never the value.
- A statistical rule needs history before it may fire; `waiting` until it has it.
- Voice: no dashes, no first person plural, K notation under $1M, "%" not "percent".

Adding a rule: copy a YAML, write the module, `node scripts/rules/engine.mjs --rule <id> --dry-run`,
then `node scripts/backtest.mjs --rule <id> --since <date>` and put the fire count in the pull request.
