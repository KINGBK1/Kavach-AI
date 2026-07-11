-- backend/migrations/0001_initial.sql
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    severity TEXT,
    timestamp TIMESTAMPTZ,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id TEXT NOT NULL,
    incident_type TEXT,
    severity TEXT,
    priority_score INTEGER,
    confidence DOUBLE PRECISION,
    summary TEXT,
    recommended_actions JSONB,
    model TEXT,
    processing_time_ms BIGINT,
    analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citizen_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    category TEXT,
    analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

