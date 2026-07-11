ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS promoted_incident_id TEXT;
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS reported_by UUID;

-- Constraints are NOT "IF NOT EXISTS" in Postgres, so guard them manually.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'citizen_reports_status_check'
    ) THEN
        ALTER TABLE citizen_reports
            ADD CONSTRAINT citizen_reports_status_check
            CHECK (status = ANY (ARRAY['unverified'::text, 'verified'::text, 'rejected'::text, 'promoted'::text]));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'citizen_reports_promoted_incident_id_fkey'
    ) THEN
        ALTER TABLE citizen_reports
            ADD CONSTRAINT citizen_reports_promoted_incident_id_fkey
            FOREIGN KEY (promoted_incident_id) REFERENCES incidents(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'citizen_reports_reported_by_fkey'
    ) THEN
        ALTER TABLE citizen_reports
            ADD CONSTRAINT citizen_reports_reported_by_fkey
            FOREIGN KEY (reported_by) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'citizen_reports_reviewed_by_fkey'
    ) THEN
        ALTER TABLE citizen_reports
            ADD CONSTRAINT citizen_reports_reviewed_by_fkey
            FOREIGN KEY (reviewed_by) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_citizen_reports_status ON citizen_reports (status);