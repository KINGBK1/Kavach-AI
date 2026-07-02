# services/store.py
import json
from app.core.db import get_conn
from app.models.incident import Incident


def save_incidents(incidents: list[Incident]):
    with get_conn() as conn:
        for i in incidents:
            conn.execute("""
                INSERT OR IGNORE INTO incidents
                (id, source, title, description, category, latitude, longitude, severity, timestamp, url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (i.id, i.source, i.title, i.description, i.category,
                  i.latitude, i.longitude, i.severity,
                  i.timestamp.isoformat() if i.timestamp else None, i.url))


def already_analyzed(incident_id: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM analyses WHERE incident_id = ?", (incident_id,)
        ).fetchone()
        return row is not None


def save_analysis(incident_id: str, result: dict):
    a = result["analysis"]
    m = result["metadata"]
    with get_conn() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO analyses
            (incident_id, incident_type, severity, priority_score, confidence, summary, recommended_actions, model, processing_time_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (incident_id, a["incident_type"], a["severity"], a["priority_score"],
              a["confidence"], a["summary"], json.dumps(a["recommended_actions"]),
              m["model"], m["processing_time_ms"]))


def get_dashboard_stats():
    with get_conn() as conn:

        total = conn.execute(
            "SELECT COUNT(*) FROM incidents"
        ).fetchone()[0]

        analyzed = conn.execute(
            "SELECT COUNT(*) FROM analyses"
        ).fetchone()[0]

        avg_priority = conn.execute(
            "SELECT ROUND(AVG(priority_score), 1) FROM analyses"
        ).fetchone()[0]

        severity_rows = conn.execute("""
            SELECT severity, COUNT(*) as count
            FROM analyses
            GROUP BY severity
            ORDER BY count DESC
        """).fetchall()

        category_rows = conn.execute("""
            SELECT i.category, COUNT(*) as count
            FROM incidents i
            GROUP BY i.category
            ORDER BY count DESC
        """).fetchall()

        source_rows = conn.execute("""
            SELECT i.source, COUNT(*) as count
            FROM incidents i
            GROUP BY i.source
            ORDER BY count DESC
        """).fetchall()

        critical_rows = conn.execute("""
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
        """).fetchall()

        recent_rows = conn.execute("""
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
        """).fetchall()

        return {
            "summary": {
                "total_incidents": total,
                "total_analyzed": analyzed,
                "average_priority_score": avg_priority,
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
                    "analyzed_at": row["analyzed_at"],
                }
                for row in recent_rows
            ],
        }