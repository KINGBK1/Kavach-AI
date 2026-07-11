-- Users table backing local (username/password) and Google OAuth login.
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT UNIQUE,
    email           TEXT UNIQUE,
    password_hash   TEXT,
    google_id       TEXT UNIQUE,
    role            TEXT NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user', 'admin', 'ngo', 'ddmo')),
    official_id     TEXT,
    location        TEXT,
    phone           TEXT,
    bio             TEXT,
    picture         TEXT,
    is_approved     BOOLEAN NOT NULL DEFAULT TRUE,
    ngo_details     JSONB,
    preferences     JSONB NOT NULL DEFAULT '{
        "emailAlerts": true,
        "smsAlerts": false,
        "pushNotifications": true,
        "weatherAlerts": true,
        "emergencyAlerts": true
    }'::jsonb,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
 
-- gen_random_uuid() requires pgcrypto on some Postgres installs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;