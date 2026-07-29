import os
import time
import logging
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from dotenv import load_dotenv

from app.core.models import Base

load_dotenv()

logger = logging.getLogger(__name__)

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


# Arbitrary fixed key for a Postgres session-level advisory lock. Only used
# to keep concurrent instances of *this* service (e.g. multiple uvicorn
# --reload workers, or two ml-services processes racing on startup) from
# running the schema-fixup block below at the same time. It does NOT
# coordinate with the Rust backend's own sqlx migrations (a separate
# process with its own internal advisory-lock key) — see the retry logic
# in init_db() for why that cross-service race is handled differently.
_SCHEMA_LOCK_KEY = 727001

# How many times to retry the whole schema-fixup block if Postgres reports
# a deadlock (SQLSTATE 40P01 / psycopg2.errors.DeadlockDetected).
_DEADLOCK_MAX_ATTEMPTS = 4
_DEADLOCK_BASE_DELAY_SECONDS = 0.5


def _run_schema_migrations(cur):
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
    # Backs the ORDER BY in get_stored_incidents() (services/store.py), which
    # sorts by activity recency (source_updated_at/updated_at/last_seen_at,
    # falling back to timestamp) rather than raw timestamp — without this,
    # that COALESCE expression would force a sequential scan + sort over the
    # whole table on every /sources/all request.
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_incidents_activity_recency
            ON incidents (COALESCE(source_updated_at, updated_at, last_seen_at, timestamp) DESC)
        """
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


def init_db():
    """
    Runs the schema-fixup DDL above and then creates any remaining
    SQLAlchemy-mapped tables.

    This races against the Rust backend's own `sqlx::migrate!()` run at its
    startup (see backend/src/main.rs) — both processes ALTER/CREATE INDEX
    on the same `incidents`/`analyses` tables, in different orders, with no
    coordination between them. When both happen to be starting at once
    (the normal case in local dev, where backend + ml-services are both
    running), Postgres can and does detect a genuine lock-order deadlock
    and kill one side (psycopg2.errors.DeadlockDetected / SQLSTATE 40P01).

    Two things make that recoverable rather than fatal:
      1. Every statement above is `IF NOT EXISTS`-guarded, so it's safe to
         simply run the whole block again.
      2. Postgres deadlock detection always aborts exactly one of the two
         transactions and lets the other proceed to completion — so the
         "losing" side just needs to wait a moment and retry; it isn't
         actually stuck.
    A session-level advisory lock additionally serializes concurrent runs
    of *this* service against itself (e.g. multiple --reload workers),
    which the retry alone wouldn't fix since neither side would ever back
    off from a true self-collision loop. It's transaction-scoped
    (pg_advisory_xact_lock), so it's released automatically whether this
    transaction commits or rolls back — no manual unlock bookkeeping needed.
    """
    delay = _DEADLOCK_BASE_DELAY_SECONDS
    for attempt in range(1, _DEADLOCK_MAX_ATTEMPTS + 1):
        try:
            with get_conn() as conn:
                cur = conn.cursor()
                # Transaction-scoped, not session-scoped: it's released
                # automatically on commit *or* rollback. A session-scoped
                # pg_advisory_lock()/pg_advisory_unlock() pair would be
                # fragile here — if a deadlock aborts this transaction, a
                # manual unlock call afterwards would itself fail (you
                # can't run further statements in an already-aborted
                # transaction), silently leaking the lock on that pooled
                # connection forever.
                cur.execute("SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK_KEY,))
                _run_schema_migrations(cur)
            break
        except psycopg2.errors.DeadlockDetected:
            if attempt == _DEADLOCK_MAX_ATTEMPTS:
                raise
            logger.warning(
                "init_db(): deadlock detected on attempt %s/%s — likely racing the "
                "Rust backend's own migrations against the same tables. Retrying in "
                "%.1fs.",
                attempt,
                _DEADLOCK_MAX_ATTEMPTS,
                delay,
            )
            time.sleep(delay)
            delay *= 2

    Base.metadata.create_all(bind=engine)