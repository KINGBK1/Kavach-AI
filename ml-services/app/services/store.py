# services/store.py
import json
import re
from datetime import datetime
from functools import lru_cache

from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

from app.core.db import get_conn
from app.models.incident import Incident
from app.services.query_parser import COMMON_LOCATIONS


def _to_isoformat(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def get_stored_incidents(limit: int = 500, offset: int = 0) -> list[dict]:
    """Read incidents straight from Postgres, joined with AI analyses if present."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT i.id, i.source, COALESCE(a.incident_type, i.title) as title, i.description,
                   i.category, i.latitude, i.longitude,
                   COALESCE(a.severity, i.severity) as severity, i.timestamp, i.url, i.location, i.country, i.updated_at,
                   i.status, i.source_updated_at, i.expected_end, i.confirmation_streak,
                   i.last_seen_at, a.incident_type
            FROM incidents i
            LEFT JOIN analyses a ON i.id = a.incident_id
            ORDER BY COALESCE(i.source_updated_at, i.updated_at, i.last_seen_at, i.timestamp) DESC NULLS LAST
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
        rows = cursor.fetchall()

    return [
        {
            "id": row["id"],
            "source": row["source"],
            "title": row["title"],
            "description": row["description"],
            "category": row["category"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "severity": row["severity"],
            "timestamp": _to_isoformat(row["timestamp"]),
            "url": row["url"],
            "location": row["location"],
            "country": row["country"],
            "updated_at": _to_isoformat(row["updated_at"]),
            "status": row["status"],
            "source_updated_at": _to_isoformat(row["source_updated_at"]),
            "expected_end": _to_isoformat(row["expected_end"]),
            "confirmation_streak": row["confirmation_streak"],
            "last_seen_at": _to_isoformat(row["last_seen_at"]),
            "incident_type": row["incident_type"],
        }
        for row in rows
    ]


def get_stored_analyses(limit: int = 500) -> list[dict]:
    """Read incident+analysis pairs straight from Postgres."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT a.incident_id, i.source, a.incident_type, a.severity, a.priority_score,
                   a.confidence, a.summary, a.recommended_actions, a.model,
                   a.processing_time_ms, a.analyzed_at
            FROM analyses a
            JOIN incidents i ON a.incident_id = i.id
            ORDER BY a.analyzed_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()

    results = []
    for row in rows:
        raw_actions = row["recommended_actions"]
        # Same defensive handling as retriever.py's parse_result — most
        # rows are a JSON string needing loads(), but don't silently
        # discard real data if a row already comes back as a list.
        if isinstance(raw_actions, list):
            actions = raw_actions
        elif raw_actions:
            try:
                actions = json.loads(raw_actions)
            except (TypeError, ValueError):
                actions = []
        else:
            actions = []
        results.append(
            {
                "incident_id": row["incident_id"],
                "source": row["source"],
                "analysis": {
                    "incident_type": row["incident_type"],
                    "severity": row["severity"],
                    "priority_score": row["priority_score"],
                    "confidence": row["confidence"],
                    "summary": row["summary"],
                    "recommended_actions": actions,
                },
                "metadata": {
                    "model": row["model"],
                    "processing_time_ms": row["processing_time_ms"],
                    "analyzed_at": _to_isoformat(row["analyzed_at"]),
                },
            }
        )
    return results


_geolocator = Nominatim(user_agent="kavach-ai/1.0", timeout=10)
_reverse_geocode = RateLimiter(_geolocator.reverse, min_delay_seconds=2, max_retries=0)


@lru_cache(maxsize=2048)
def _reverse_lookup(lat: float, lng: float) -> tuple[str | None, str | None]:
    """Reverse geocode (lat, lng) → (city_or_region, country)."""
    try:
        location = _reverse_geocode((lat, lng), exactly_one=True, language="en")
        if location:
            raw = location.raw.get("address", {})
            country = raw.get("country")
            # Prefer city/town/village; fall back to state/region
            place = raw.get("city") or raw.get("town") or raw.get("village") or raw.get("state") or raw.get("country")
            return place, country
    except Exception:
        pass
    return None, None


def _text_mentions_location(text: str, location: str) -> bool:
    """Whole-word match so 'india' doesn't match inside 'indiana'."""
    pattern = r"(?<![a-z0-9])" + re.escape(location.lower()) + r"(?![a-z0-9])"
    return re.search(pattern, text) is not None


def _infer_location_and_country(incident: Incident) -> tuple[str | None, str | None]:
    if incident.location or incident.country:
        return incident.location, incident.country

    # Try reverse geocoding from coordinates first
    if incident.latitude is not None and incident.longitude is not None:
        # Only try if it's not Null Island (0, 0)
        if abs(incident.latitude) > 0.01 or abs(incident.longitude) > 0.01:
            place, country = _reverse_lookup(incident.latitude, incident.longitude)
            if place or country:
                return place, country

    text = " ".join(
        part for part in [incident.title, incident.description] if part
    ).lower()

    for location in COMMON_LOCATIONS:
        if _text_mentions_location(text, location):
            return location, location

    return None, None


def save_incidents(incidents: list[Incident]):
    if not incidents:
        return

    print(f"[STORE] saving {len(incidents)} incidents...", flush=True)

    # Group incoming incidents by source so the "missed this cycle" decay
    # step below only resets streaks for sources we actually just fetched.
    # Without this, one connector failing/returning nothing in a cycle
    # would wrongly reset every OTHER source's streaks too.
    sources_in_this_batch = {i.source for i in incidents}

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
                    i.status,
                    i.source_updated_at.isoformat() if i.source_updated_at else None,
                    i.expected_end.isoformat() if i.expected_end else None,
                )
            )

        # Every incident in this batch was just re-confirmed present in its
        # source feed, so:
        #   - on first insert: confirmation_streak starts at 1, last_seen_at = NOW()
        #   - on conflict (already existed): confirmation_streak increments,
        #     last_seen_at bumps to NOW()
        # `status`/`source_updated_at`/`expected_end` use COALESCE so a
        # cycle where the source temporarily omits these fields doesn't
        # blow away a previously-known value.
        cursor.executemany("""
            INSERT INTO incidents
            (id, source, title, description, category, latitude, longitude, severity,
             timestamp, url, location, country, status, source_updated_at, expected_end,
             confirmation_streak, last_seen_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, NOW())
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
                status = COALESCE(EXCLUDED.status, incidents.status),
                source_updated_at = COALESCE(EXCLUDED.source_updated_at, incidents.source_updated_at),
                expected_end = COALESCE(EXCLUDED.expected_end, incidents.expected_end),
                confirmation_streak = incidents.confirmation_streak + 1,
                last_seen_at = NOW(),
                updated_at = NOW()
        """, values)

        # Decay pass: any incident belonging to a source we fetched this
        # cycle, but that did NOT appear in this batch, just failed to be
        # re-confirmed — reset its streak to 0. It stays in the table (we
        # don't delete history) but drops out of "confirmed active" status.
        # Scoped to `source = ANY(%s)` so this never touches sources that
        # simply weren't part of this particular fetch_all() run.
        seen_ids = [i.id for i in incidents]
        cursor.execute(
            """
            UPDATE incidents
            SET confirmation_streak = 0
            WHERE source = ANY(%s)
              AND id != ALL(%s)
              AND confirmation_streak != 0
            """,
            (list(sources_in_this_batch), seen_ids),
        )

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


def get_incidents_count() -> int:
    """COUNT(*) over the entire incidents table — always the real total."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM incidents")
        return cursor.fetchone()["count"]


def get_analyses_count() -> int:
    """COUNT(*) over the entire analyses table — always the real total."""
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM analyses")
        return cursor.fetchone()["count"]


def get_daily_incidents(days: int = 30) -> list[dict]:
    """Aggregate incidents by calendar day over the full table.

    Returns one row per day with the total incident count, covering the
    last N days (default 30) up to the latest incident timestamp.
    """
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                DATE(timestamp) AS day,
                COUNT(*) AS count
            FROM incidents
            WHERE timestamp IS NOT NULL
            GROUP BY DATE(timestamp)
            ORDER BY day DESC
            LIMIT %s
        """, (days,))
        rows = cursor.fetchall()

    return [
        {
            "day": str(r["day"]),
            "incidents": r["count"],
        }
        for r in rows
    ]


def get_hourly_severity() -> list[dict]:
    """Aggregate all incidents by hour-of-day and severity in SQL.

    Returns 24 rows (one per hour), each with severity counts and a total,
    computed over the full incidents table regardless of fetch limits.
    """
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM timestamp)::int AS hour,
                COALESCE(severity, 'Unknown') AS severity,
                COUNT(*) AS count
            FROM incidents
            WHERE timestamp IS NOT NULL
            GROUP BY hour, severity
            ORDER BY hour, severity
        """)
        rows = cursor.fetchall()

    # Build 24-row result with all four severity keys pre-seeded.
    SEVERITY_KEYS = ["Critical", "High", "Moderate", "Low"]
    hourly = {
        h: {s: 0 for s in SEVERITY_KEYS} | {"hour": h, "total": 0}
        for h in range(24)
    }
    for r in rows:
        h = r["hour"]
        sev = r["severity"]
        count = r["count"]
        # Map DB severity to one of the four known keys
        key = next((s for s in SEVERITY_KEYS if s.lower() == sev.lower()), None)
        if key:
            hourly[h][key] += count
            hourly[h]["total"] += count
        else:
            # Unknown severity still counts toward total
            hourly[h]["total"] += count

    return [hourly[h] for h in range(24)]


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


def update_incident_status(incident_id: str, status: str) -> bool:
    """Update the status ('active' | 'resolved') of an incident in Postgres."""
    valid_statuses = {"active", "resolved", "unknown"}
    clean_status = status.lower().strip()
    if clean_status not in valid_statuses:
        raise ValueError(f"Invalid status '{status}'. Must be one of: {valid_statuses}")

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE incidents
            SET status = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (clean_status, incident_id),
        )
        return cursor.rowcount > 0