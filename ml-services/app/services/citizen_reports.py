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
import os
from datetime import datetime, timezone

import requests

from app.core.db import get_conn

MAIL_SERVICE_URL = os.getenv("MAIL_SERVICE_URL", "http://localhost:8001")

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


def _trigger_promote_alert(
    incident_id: str,
    description: str,
    latitude: float,
    longitude: float,
    category: str,
    analysis: dict,
) -> None:
    payload = {
        "incident_id": incident_id,
        "title": (description or "")[:80],
        "description": description or "",
        "summary": analysis.get("summary", "") if isinstance(analysis, dict) else "",
        "recommended_actions": analysis.get("recommended_actions", []) if isinstance(analysis, dict) else [],
        "latitude": latitude,
        "longitude": longitude,
        "category": category or "",
        "incident_type": analysis.get("incident_type", "") if isinstance(analysis, dict) else "",
        "severity": analysis.get("severity", "") if isinstance(analysis, dict) else "",
        "source": "citizen-report",
    }
    try:
        resp = requests.post(f"{MAIL_SERVICE_URL}/alerts", json=payload, timeout=30)
        if resp.ok:
            print(f"[PROMOTE] Alert sent for {incident_id}: sent={resp.json().get('sent', '?')}", flush=True)
        else:
            print(f"[PROMOTE] Mail service returned {resp.status_code} for {incident_id}: {resp.text}", flush=True)
    except Exception as e:
        print(f"[PROMOTE] Failed to send alert for {incident_id}: {e}", flush=True)


def promote_citizen_report(report_id: str, reviewed_by: str) -> dict:
    """Promote a citizen report to the trusted incidents table.
    Returns {incident_id, status} or raises ValueError if not found."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, description, latitude, longitude, category, analysis, status FROM citizen_reports WHERE id = %s",
            (report_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Report {report_id} not found")
        if row["status"] == "promoted":
            raise ValueError(f"Report {report_id} already promoted")

        analysis = row["analysis"]
        incident_id = f"citizen-promoted-{report_id}"
        cursor.execute(
            """
            INSERT INTO incidents
                (id, source, title, description, category, latitude, longitude, severity, timestamp, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), 'active')
            ON CONFLICT (id) DO NOTHING
            """,
            (
                incident_id,
                "citizen-report",
                (row["description"] or "")[:80],
                row["description"],
                row["category"],
                row["latitude"],
                row["longitude"],
                analysis.get("severity") if isinstance(analysis, dict) else None,
            ),
        )

        cursor.execute(
            "UPDATE citizen_reports SET status = 'promoted', promoted_incident_id = %s, reviewed_by = %s, reviewed_at = NOW() WHERE id = %s",
            (incident_id, reviewed_by, report_id),
        )

    _trigger_promote_alert(
        incident_id=incident_id,
        description=row["description"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        category=row["category"],
        analysis=analysis,
    )

    return {"incident_id": incident_id, "status": "promoted"}


def reject_citizen_report(report_id: str, reviewed_by: str) -> dict:
    """Mark a citizen report as rejected by a human reviewer."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE citizen_reports SET status = 'rejected', reviewed_by = %s, reviewed_at = NOW() WHERE id = %s AND status != 'promoted'",
            (reviewed_by, report_id),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"Report {report_id} not found or already promoted")
    return {"status": "rejected", "id": report_id}


def get_citizen_reports(status: str | None = None, limit: int = 100) -> list[dict]:
    with get_conn() as conn:
        cursor = conn.cursor()
        base_sql = """
            SELECT cr.id, cr.description, cr.latitude, cr.longitude,
                   cr.category, cr.analysis, cr.reported_by, cr.status,
                   cr.created_at, u.username, u.email
            FROM citizen_reports cr
            LEFT JOIN users u ON u.id = cr.reported_by::uuid
        """
        if status:
            cursor.execute(
                base_sql + " WHERE cr.status = %s ORDER BY cr.created_at DESC LIMIT %s",
                (status, limit),
            )
        else:
            cursor.execute(
                base_sql + " ORDER BY cr.created_at DESC LIMIT %s",
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
            "reporter_username": row["username"],
            "reporter_email": row["email"],
            "status": row["status"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]