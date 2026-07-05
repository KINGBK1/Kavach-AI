import asyncio
import os
import re
import time
from datetime import datetime
from typing import Any

import requests

from app.services.aggregator import IncidentAggregator
from app.services.analyzer import analyze_fetched_incident
from app.services.store import save_incidents, save_analysis
from app.core.db import get_conn

MAIL_SERVICE_URL = os.getenv("MAIL_SERVICE_URL", "http://localhost:8001")

SCHEDULE_INTERVAL_SECONDS = 30 * 60

# Minimum gap between consecutive LLM analysis calls, to stay under Gemini's
# free-tier requests-per-minute limit. Tune this up if you're still seeing
# 429s, or down if you're on a paid tier with higher limits.
MIN_SECONDS_BETWEEN_CALLS = 4.0

# Retry behavior for transient 429 RESOURCE_EXHAUSTED errors specifically.
MAX_RETRIES_ON_RATE_LIMIT = 3
BASE_BACKOFF_SECONDS = 20.0


def _fetch_new_incidents() -> list[Any]:
    aggregator = IncidentAggregator()
    incidents = aggregator.fetch_all()
    save_incidents(incidents)

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT incident_id FROM analyses")
        analyzed_ids = {row["incident_id"] for row in cursor.fetchall()}

    pending = [incident for incident in incidents if incident.id not in analyzed_ids]
    return pending


def _is_rate_limit_error(exc: Exception) -> bool:
    text = str(exc)
    return "429" in text or "RESOURCE_EXHAUSTED" in text


def _extract_retry_delay_seconds(exc: Exception) -> float | None:
    """Best-effort parse of a suggested retry delay from the error text."""
    match = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)", str(exc))
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def _analyze_pending(pending: list[Any]) -> None:
    total = len(pending)
    for index, incident in enumerate(pending, start=1):
        attempt = 0
        analyzed = False
        while True:
            attempt += 1
            try:
                print(f"[SCHED] analyzing {incident.id} ({index}/{total})", flush=True)
                result = analyze_fetched_incident(incident)
                save_analysis(incident.id, result)
                analyzed = True
                break
            except Exception as e:
                if _is_rate_limit_error(e) and attempt <= MAX_RETRIES_ON_RATE_LIMIT:
                    wait = _extract_retry_delay_seconds(e) or (BASE_BACKOFF_SECONDS * attempt)
                    print(
                        f"[SCHED] rate limited on {incident.id}, "
                        f"retry {attempt}/{MAX_RETRIES_ON_RATE_LIMIT} in {wait:.0f}s",
                        flush=True,
                    )
                    time.sleep(wait)
                    continue
                print(f"[SCHED] analysis failed for {incident.id}: {e}", flush=True)
                break

        if analyzed:
            _trigger_alert(incident, result)

        time.sleep(MIN_SECONDS_BETWEEN_CALLS)


async def run_scheduler() -> None:
    print("[SCHED] background scheduler started", flush=True)
    while True:
        try:
            print(f"[SCHED] running fetch/analyze cycle {datetime.utcnow().isoformat()}", flush=True)
            pending = await asyncio.to_thread(_fetch_new_incidents)
            if pending:
                await asyncio.to_thread(_analyze_pending, pending)
            else:
                print("[SCHED] no new incidents to analyze", flush=True)
        except Exception as exc:
            print(f"[SCHED] cycle error: {exc}", flush=True)
        await asyncio.sleep(SCHEDULE_INTERVAL_SECONDS)


def _mark_alert_sent(incident_id: str) -> None:
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE analyses SET alert_sent = TRUE WHERE incident_id = %s",
                (incident_id,),
            )
    except Exception as e:
        print(f"[SCHED] failed to mark alert_sent for {incident_id}: {e}", flush=True)


def _trigger_alert(incident: Any, result: dict) -> None:
    try:
        analysis = result.get("analysis", {})
        payload = {
            "incident_id": incident.id,
            "title": incident.title,
            "description": incident.description,
            "summary": analysis.get("summary", incident.description),
            "recommended_actions": analysis.get("recommended_actions", []),
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "category": incident.category,
            "incident_type": analysis.get("incident_type", ""),
            "severity": analysis.get("severity", ""),
            "source": incident.source,
        }
        resp = requests.post(
            f"{MAIL_SERVICE_URL}/alerts",
            json=payload,
            timeout=30,
        )
        if resp.ok:
            _mark_alert_sent(incident.id)
            print(
                f"[SCHED] alert triggered for {incident.id}: {resp.json()}",
                flush=True,
            )
        else:
            print(
                f"[SCHED] alert service returned {resp.status_code} for {incident.id}: {resp.text}",
                flush=True,
            )
    except Exception as e:
        print(f"[SCHED] alert trigger failed for {incident.id}: {e}", flush=True)