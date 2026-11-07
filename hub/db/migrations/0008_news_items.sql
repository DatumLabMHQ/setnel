-- News feed: articles and posts pulled from Google News (and X when a token is set), each
-- correlated against our own metrics and incidents. A relevant item is also posted as a content
-- signal (events, detector_id = 'news'), so the Content page, /api/v1/signals and the daily brief
-- pick it up; this table is the full stream the Feed page shows, relevant or not.
CREATE TABLE IF NOT EXISTS news_items (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source         TEXT NOT NULL,                    -- 'google-news' | 'x'
  publisher      TEXT,
  url            TEXT NOT NULL,
  url_hash       TEXT NOT NULL UNIQUE,             -- sha256 of the normalised url (dedupe)
  title          TEXT NOT NULL,
  summary        TEXT,
  published_at   TIMESTAMPTZ,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  topics         TEXT[] NOT NULL DEFAULT '{}',     -- topic ids whose query found it
  status         TEXT NOT NULL DEFAULT 'new',      -- new | correlated | skipped | dismissed
  relevant       BOOLEAN,
  confidence     REAL,
  respond_worthy BOOLEAN NOT NULL DEFAULT false,
  correlation    JSONB NOT NULL DEFAULT '{}',      -- angle, why, dataHook, draft, numbers, protocols
  signal_id      BIGINT,                           -- events.id once promoted to a content signal
  correlated_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS news_items_published_idx ON news_items (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS news_items_new_idx ON news_items (fetched_at) WHERE status = 'new';
