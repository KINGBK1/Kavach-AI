import os
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from dotenv import load_dotenv

from app.core.models import Base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

# SQLAlchemy
engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
    future=True,
)

# Lazy psycopg2 pool
_pg_pool = None


def get_pool():
    global _pg_pool

    if _pg_pool is None:
        _pg_pool = pg_pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=int(os.getenv("DB_POOL_MAX", "8")),
            dsn=DATABASE_URL,
            cursor_factory=RealDictCursor,
        )

    return _pg_pool


@contextmanager
def get_conn():
    pool = get_pool()
    conn = pool.getconn()

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


@contextmanager
def get_session():
    session = SessionLocal()

    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db():
    with get_conn() as conn:
        cur = conn.cursor()

        cur.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            latitude REAL,
            longitude REAL,
            severity TEXT,
            timestamp TIMESTAMPTZ,
            url TEXT,
            location TEXT,
            country TEXT,
            inserted_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            incident_id TEXT PRIMARY KEY,
            incident_type TEXT,
            severity TEXT,
            priority_score INTEGER,
            confidence REAL,
            summary TEXT,
            recommended_actions TEXT,
            model TEXT,
            processing_time_ms INTEGER,
            analyzed_at TIMESTAMPTZ DEFAULT NOW(),
            alert_sent BOOLEAN DEFAULT FALSE
        )
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS analysis_history (
            id SERIAL PRIMARY KEY,
            incident_id TEXT NOT NULL,
            incident_type TEXT,
            severity TEXT,
            priority_score INTEGER,
            confidence REAL,
            summary TEXT,
            recommended_actions TEXT,
            model TEXT,
            processing_time_ms INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """)

        # `CREATE TABLE IF NOT EXISTS` above only runs the CREATE when the
        # table doesn't exist at all — it silently does nothing if e.g. the
        # Rust backend's sqlx migrations already created `incidents` first
        # (its earliest migration doesn't include location/country/etc).
        # These ADD COLUMN IF NOT EXISTS calls make init_db idempotent
        # against a table that already exists but is missing columns this
        # service expects, regardless of which service started first.
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location TEXT")
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS country TEXT")
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW()")
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()")
        cur.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS alert_sent BOOLEAN DEFAULT FALSE")

        # Older databases created by the Rust migration have analyses.id as
        # the primary key and no unique constraint on incident_id. The
        # scheduler upserts the latest analysis by incident_id, so repair that
        # shape here too in case the ML service starts before Rust migrations.
        cur.execute("""
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
              AND r.row_num > 1
        """)
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_incident_id_unique
                ON analyses (incident_id)
        """)

        # Disaster lifecycle columns (see backend/migrations/0005_incident_status.sql
        # for the Rust-side equivalent — kept in sync here so this service
        # is self-sufficient even if it starts up before the Rust backend
        # ever runs its migrations).
        cur.execute("""
            ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status TEXT
                CHECK (status IN ('active', 'resolved', 'unknown'))
        """)
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ")
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS expected_end TIMESTAMPTZ")
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS confirmation_streak INTEGER NOT NULL DEFAULT 0")
        cur.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ")

        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents(source)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_country ON incidents(country)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_analysis_history_incident_id ON analysis_history(incident_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_analyses_priority_score ON analyses(priority_score)"
        )

    Base.metadata.create_all(bind=engine)
