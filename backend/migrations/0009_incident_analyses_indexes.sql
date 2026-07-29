-- Add missing indexes on timestamp (DESC ordering) for the two most common
-- dashboard/incident-list queries.  get_stored_incidents() runs
--   ORDER BY timestamp DESC NULLS LAST LIMIT %s
-- and get_stored_analyses() runs
--   ORDER BY a.analyzed_at DESC LIMIT %s
-- on the incidents and analyses tables respectively.  Without these indexes
-- every page load triggered sequential scans over the full table.
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents (timestamp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON analyses (analyzed_at DESC);
