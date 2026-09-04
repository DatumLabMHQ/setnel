-- Content signals live in the events table (category = 'signal') rather than a parallel
-- store, so they share detector config, dedup and audit. They never open incidents and never
-- page. signal_status tracks the editorial workflow: new -> used | dismissed.
ALTER TABLE events ADD COLUMN IF NOT EXISTS signal_status TEXT;
CREATE INDEX IF NOT EXISTS events_signal_status_idx ON events (signal_status, fired_at DESC) WHERE category = 'signal';
