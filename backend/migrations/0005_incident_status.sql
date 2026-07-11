

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IN ('active', 'resolved', 'unknown'));


ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;


ALTER TABLE incidents ADD COLUMN IF NOT EXISTS expected_end TIMESTAMPTZ;


ALTER TABLE incidents ADD COLUMN IF NOT EXISTS confirmation_streak INTEGER NOT NULL DEFAULT 0;


ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;


CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);