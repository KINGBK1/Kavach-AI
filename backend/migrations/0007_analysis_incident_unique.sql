-- `analyses` is the latest-analysis table: `analysis_history` keeps every
-- run, while this table is upserted by incident id. The original migration
-- made `id` the only unique column, so `ON CONFLICT (incident_id)` failed on
-- databases created from that schema.

WITH ranked AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY incident_id
            ORDER BY analyzed_at DESC NULLS LAST, ctid DESC
        ) AS row_num
    FROM analyses
)
DELETE FROM analyses a
USING ranked r
WHERE a.ctid = r.ctid
  AND r.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_incident_id_unique
    ON analyses (incident_id);
