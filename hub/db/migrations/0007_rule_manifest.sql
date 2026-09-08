-- The rules manifest (rules/*.yml in this repo) as last posted by the engine, so the Content page can
-- show what can fire, on what data, at what threshold, and what each waiting rule still needs.
CREATE TABLE IF NOT EXISTS rule_manifest (
  id             TEXT PRIMARY KEY,
  dashboard_id   TEXT NOT NULL,
  owner          TEXT NOT NULL,
  product        TEXT NOT NULL,
  schedule       TEXT NOT NULL,
  status         TEXT NOT NULL,
  needs          TEXT,
  description    TEXT NOT NULL,
  severity       TEXT NOT NULL,
  cooldown_hours INTEGER NOT NULL,
  params         JSONB NOT NULL DEFAULT '{}',
  gates          JSONB NOT NULL DEFAULT '{}',
  source         TEXT,
  last_ran_at    TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
