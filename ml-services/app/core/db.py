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
            analyzed_at TIMESTAMPTZ DEFAULT NOW()
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
            "CREATE INDEX IF NOT EXISTS idx_analysis_history_incident_id ON analysis_history(incident_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_analyses_priority_score ON analyses(priority_score)"
        )

    Base.metadata.create_all(bind=engine)