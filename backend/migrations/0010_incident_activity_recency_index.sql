CREATE INDEX IF NOT EXISTS idx_incidents_activity_recency
    ON incidents (COALESCE(source_updated_at, updated_at, last_seen_at, timestamp) DESC);