# core/db.py
import sqlite3
from contextlib import contextmanager

DB_PATH = "varuna.db"

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                source TEXT,
                title TEXT,
                description TEXT,
                category TEXT,
                latitude REAL,
                longitude REAL,
                severity TEXT,
                timestamp TEXT,
                url TEXT,
                fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                incident_id TEXT PRIMARY KEY,
                incident_type TEXT,
                severity TEXT,
                priority_score INTEGER,
                confidence INTEGER,
                summary TEXT,
                recommended_actions TEXT,
                model TEXT,
                processing_time_ms INTEGER,
                analyzed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (incident_id) REFERENCES incidents (id)
            )
        """)

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()