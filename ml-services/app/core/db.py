# core/db.py
import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

from app.core.models import Base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def init_db():
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
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
        cursor.execute("""
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
        cursor.execute("""
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
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location TEXT")
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS country TEXT")
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW()")
        cursor.execute("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()")
        conn.commit()

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents(source)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_country ON incidents(country)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_analysis_history_incident_id ON analysis_history(incident_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_analyses_priority_score ON analyses(priority_score)")
        conn.commit()
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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