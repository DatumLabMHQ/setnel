-- The day's content brief: the signals summarised in three layers (datum-context/house/3step.md).
CREATE TABLE IF NOT EXISTS content_briefs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day         DATE NOT NULL UNIQUE,
  layer1      TEXT NOT NULL,
  layer2      TEXT NOT NULL,
  layer3      TEXT NOT NULL,
  model       TEXT NOT NULL,
  signal_ids  BIGINT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
