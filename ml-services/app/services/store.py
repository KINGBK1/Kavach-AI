# services/store.py
import json
from app.core.db import get_conn
from app.models.incident import Incident
from app.services.query_parser import COMMON_LOCATIONS


def _infer_location_and_country(incident: Incident) -> tuple[str | None, str | None]:
    if incident.location or incident.country:
        return incident.location, incident.country

    text = " ".join(
        part for part in [incident.title, incident.description] if part
    ).lower()

    for location in COMMON_LOCATIONS:
        if location.lower() in text:
            return location, location

    return None, None


def save_incidents(incidents: list[Incident]):
    if not incidents:
        return

    print(f"[STORE] saving {len(incidents)} incidents...", flush=True)

    with get_conn() as conn:
        cursor = conn.cursor()

        values = []
        for i in incidents:
            location, country = _infer_location_and_country(i)
            values.append(
                (
                    i.id,
                    i.source,
                    i.title,
                    i.description,
                    i.category,
                    i.latitude,
                    i.longitude,
                    i.severity,
                    i.timestamp.isoformat() if i.timestamp else None,
                    i.url,
                    location,
                    country,
                )
            )

        cursor.executemany("""
            INSERT INTO incidents
            (id, source, title, description, category, latitude, longitude, severity, timestamp, url, location, country)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                source = EXCLUDED.source,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                severity = COALESCE(EXCLUDED.severity, incidents.severity),
                timestamp = COALESCE(EXCLUDED.timestamp, incidents.timestamp),
                url = COALESCE(EXCLUDED.url, incidents.url),
                location = COALESCE(EXCLUDED.location, incidents.location),
                country = COALESCE(EXCLUDED.country, incidents.country),
                updated_at = NOW()
        """, values)

    print(f"[STORE] saved {len(incidents)} incidents", flush=True)


def already_analyzed(incident_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM analyses WHERE incident_id = %s", (incident_id,)
        )
        return cursor.fetchone() is not None


def save_analysis(incident_id: str, result: dict):
    a = result["analysis"]
    m = result["metadata"]
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO analysis_history
            (incident_id, incident_type, severity, priority_score, confidence, summary, recommended_actions, model, processing_time_ms)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            incident_id,
            a["incident_type"],
            a["severity"],
            a["priority_score"],
            a["confidence"],
            a["summary"],
            json.dumps(a["recommended_actions"]),
            m["model"],
            m["processing_time_ms"],
        ))
        cursor.execute("""
            INSERT INTO analyses
            (incident_id, incident_type, severity, priority_score, confidence, summary, recommended_actions, model, processing_time_ms)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (incident_id) DO UPDATE SET
                incident_type = EXCLUDED.incident_type,
                severity = EXCLUDED.severity,
                priority_score = EXCLUDED.priority_score,
                confidence = EXCLUDED.confidence,
                summary = EXCLUDED.summary,
                recommended_actions = EXCLUDED.recommended_actions,
                model = EXCLUDED.model,
                processing_time_ms = EXCLUDED.processing_time_ms,
                analyzed_at = NOW()
        """, (
            incident_id,
            a["incident_type"],
            a["severity"],
            a["priority_score"],
            a["confidence"],
            a["summary"],
            json.dumps(a["recommended_actions"]),
            m["model"],
            m["processing_time_ms"],
        ))


def get_dashboard_stats():
    with get_conn() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as count FROM incidents")
        total = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM analyses")
        analyzed = cursor.fetchone()["count"]

        cursor.execute("SELECT ROUND(AVG(priority_score)::numeric, 1) as avg FROM analyses")
        avg_priority = cursor.fetchone()["avg"]

        cursor.execute("""
            SELECT severity, COUNT(*) as count
            FROM analyses
            GROUP BY severity
            ORDER BY count DESC
        """)
        severity_rows = cursor.fetchall()

        cursor.execute("""
            SELECT i.category, COUNT(*) as count
            FROM incidents i
            GROUP BY i.category
            ORDER BY count DESC
        """)
        category_rows = cursor.fetchall()

        cursor.execute("""
            SELECT i.source, COUNT(*) as count
            FROM incidents i
            GROUP BY i.source
            ORDER BY count DESC
        """)
        source_rows = cursor.fetchall()

        cursor.execute("""
            SELECT
                a.incident_id,
                i.title,
                i.category,
                i.source,
                i.latitude,
                i.longitude,
                a.severity,
                a.priority_score,
                a.summary,
                a.recommended_actions,
                a.incident_type
            FROM analyses a
            JOIN incidents i ON a.incident_id = i.id
            ORDER BY a.priority_score DESC
            LIMIT 5
        """)
        critical_rows = cursor.fetchall()

        cursor.execute("""
            SELECT
                a.incident_id,
                i.title,
                a.severity,
                a.priority_score,
                a.analyzed_at
            FROM analyses a
            JOIN incidents i ON a.incident_id = i.id
            ORDER BY a.analyzed_at DESC
            LIMIT 5
        """)
        recent_rows = cursor.fetchall()

        return {
            "summary": {
                "total_incidents": total,
                "total_analyzed": analyzed,
                "average_priority_score": float(avg_priority) if avg_priority else 0,
            },
            "severity_breakdown": {
                row["severity"]: row["count"]
                for row in severity_rows
            },
            "category_breakdown": {
                row["category"]: row["count"]
                for row in category_rows
            },
            "source_breakdown": {
                row["source"]: row["count"]
                for row in source_rows
            },
            "top_critical_incidents": [
                {
                    "incident_id": row["incident_id"],
                    "title": row["title"],
                    "category": row["category"],
                    "source": row["source"],
                    "latitude": row["latitude"],
                    "longitude": row["longitude"],
                    "severity": row["severity"],
                    "priority_score": row["priority_score"],
                    "summary": row["summary"],
                    "recommended_actions": json.loads(row["recommended_actions"]),
                    "incident_type": row["incident_type"],
                }
                for row in critical_rows
            ],
            "recent_analyses": [
                {
                    "incident_id": row["incident_id"],
                    "title": row["title"],
                    "severity": row["severity"],
                    "priority_score": row["priority_score"],
                    "analyzed_at": str(row["analyzed_at"]),
                }
                for row in recent_rows
            ],
        }