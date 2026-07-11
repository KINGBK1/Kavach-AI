-- Fixes a real, pre-existing type mismatch: incidents.id was created as
-- UUID (per the original migration 0001_initial.sql), but analyses.incident_id
-- is TEXT — and incident IDs are actually externally-sourced strings from
-- each connector's own API (USGS feature ids like "nc75391856", GDACS
-- eventids like "1029260", NASA EONET ids, etc), never UUIDs Kavach
-- generates itself. Any query joining incidents to analyses fails outright
-- with "operator does not exist: text = uuid" until this is fixed, and any
-- insert of a non-UUID-shaped source id (which is the normal case) would
-- fail against the UUID column too.
--
-- Safe to run whether incidents.id is currently UUID or already TEXT —
-- the type check below only converts if needed.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'incidents'
          AND column_name = 'id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE incidents ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;
END $$;

-- Also guard citizen_reports.promoted_incident_id, which references
-- incidents(id) per the schema you shared — if it was created before this
-- fix it may have inherited the same UUID assumption and would break the
-- foreign key relationship once incidents.id becomes TEXT.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'citizen_reports'
          AND column_name = 'promoted_incident_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE citizen_reports ALTER COLUMN promoted_incident_id TYPE TEXT USING promoted_incident_id::text;
    END IF;
END $$;