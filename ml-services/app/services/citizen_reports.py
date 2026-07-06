# services/citizen_reports.py
#
# Citizen reports are kept OUT of incidents/analyses entirely. Those tables
# are treated as trusted ground truth (scraped from USGS/GDACS/NASA/etc by
# the background scheduler) and are what the dashboard, map, and chat RAG
# all read from. A citizen typing a description into a form has no such
# guarantee, so it lives in its own table with its own trust status.
#
# We can't verify TRUTH — an LLM has no way to know if a report describes
# a real event. What we CAN do cheaply and honestly:
#   1. Corroborate against the trusted incidents table (same category,
#      nearby location, recent time window) — real signal, plain SQL.
#   2. Rate-limit per user — catches spam/abuse without judging content.
# Anything uncorroborated stays "unverified" and just sits in a queue for
# a human (admin/ngo/ddmo) to look at — it never auto-promotes itself.

import json
from datetime import datetime, timezone

from app.core.db import get_conn

CORROBORATION_RADIUS_DEGREES = 0.25  # ~25km at the equator, good enough for a hackathon-scale check
CORROBORATION_WINDOW_HOURS = 24

RATE_LIMIT_MAX_REPORTS = 5
RATE_LIMIT_WINDOW_HOURS = 1


def check_rate_limit(user_id: str | None) -> tuple[bool, int]:
    """
    Returns (allowed, recent_count). If user_id is None (shouldn't happen
    behind auth, but defensive), we don't block — the auth layer is the
    real gate for who can submit at all.
    """
    if not user_id:
        return True, 0

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*) as count FROM citizen_reports
            WHERE reported_by = %s
              AND created_at >= NOW() - INTERVAL '%s hours'
            """,
            (user_id, RATE_LIMIT_WINDOW_HOURS),
        )
        count = cursor.fetchone()["count"]

    return count < RATE_LIMIT_MAX_REPORTS, count


def find_corroborating_incidents(
    latitude: float,
    longitude: float,
    category: str | None,
) -> list[dict]:
    """
    Looks for trusted incidents (from incidents table, i.e. scraped sources)
    near this report in space, time, and category. If any exist, this report
    gets a real, explainable trust boost instead of relying on the LLM's
    opinion of its own text.
    """
    with get_conn() as conn:
        cursor = conn.cursor()

        if category:
            cursor.execute(
                """
                SELECT id, source, title, category, latitude, longitude, timestamp
                FROM incidents
                WHERE latitude BETWEEN %s AND %s
                  AND longitude BETWEEN %s AND %s
                  AND timestamp >= NOW() - INTERVAL '%s hours'
                  AND lower(category) = lower(%s)
                LIMIT 5
                """,
                (
                    latitude - CORROBORATION_RADIUS_DEGREES,
                    latitude + CORROBORATION_RADIUS_DEGREES,
                    longitude - CORROBORATION_RADIUS_DEGREES,
                    longitude + CORROBORATION_RADIUS_DEGREES,
                    CORROBORATION_WINDOW_HOURS,
                    category,
                ),
            )
        else:
            cursor.execute(
                """
                SELECT id, source, title, category, latitude, longitude, timestamp
                FROM incidents
                WHERE latitude BETWEEN %s AND %s
                  AND longitude BETWEEN %s AND %s
                  AND timestamp >= NOW() - INTERVAL '%s hours'
                LIMIT 5
                """,
                (
                    latitude - CORROBORATION_RADIUS_DEGREES,
                    latitude + CORROBORATION_RADIUS_DEGREES,
                    longitude - CORROBORATION_RADIUS_DEGREES,
                    longitude + CORROBORATION_RADIUS_DEGREES,
                    CORROBORATION_WINDOW_HOURS,
                ),
            )

        rows = cursor.fetchall()

    return [
        {
            "id": row["id"],
            "source": row["source"],
            "title": row["title"],
            "category": row["category"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
        }
        for row in rows
    ]


def save_citizen_report(
    description: str,
    latitude: float,
    longitude: float,
    category: str | None,
    analysis: dict,
    reported_by: str | None,
    status: str,
) -> str:
    """Inserts into citizen_reports and returns the new row's id."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO citizen_reports
                (description, latitude, longitude, category, analysis, reported_by, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                description,
                latitude,
                longitude,
                category,
                json.dumps(analysis),
                reported_by,
                status,
            ),
        )
        report_id = cursor.fetchone()["id"]

    return str(report_id)


def get_citizen_reports(status: str | None = None, limit: int = 100) -> list[dict]:
    with get_conn() as conn:
        cursor = conn.cursor()
        if status:
            cursor.execute(
                """
                SELECT id, description, latitude, longitude, category, analysis,
                       reported_by, status, created_at
                FROM citizen_reports
                WHERE status = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (status, limit),
            )
        else:
            cursor.execute(
                """
                SELECT id, description, latitude, longitude, category, analysis,
                       reported_by, status, created_at
                FROM citizen_reports
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
        rows = cursor.fetchall()

    return [
        {
            "id": str(row["id"]),
            "description": row["description"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "category": row["category"],
            "analysis": row["analysis"],
            "reported_by": str(row["reported_by"]) if row["reported_by"] else None,
            "status": row["status"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]