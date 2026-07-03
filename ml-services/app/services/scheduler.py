import asyncio
from datetime import datetime
from typing import Any

from app.services.aggregator import IncidentAggregator
from app.services.analyzer import analyze_fetched_incident
from app.services.store import save_incidents, save_analysis
from app.core.db import get_conn

SCHEDULE_INTERVAL_SECONDS = 30 * 60


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


def _analyze_pending(pending: list[Any]) -> None:
    for incident in pending:
        try:
            print(f"[SCHED] analyzing {incident.id}", flush=True)
            result = analyze_fetched_incident(incident)
            save_analysis(incident.id, result)
        except Exception as e:
            print(f"[SCHED] analysis failed for {incident.id}: {e}", flush=True)


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
