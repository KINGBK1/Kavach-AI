from fastapi import APIRouter
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.models.request import IncidentRequest
from app.services.analyzer import analyze_incident, analyze_fetched_incident
from app.services.aggregator import IncidentAggregator
from app.services.store import save_incidents, already_analyzed, save_analysis

from app.services.store import save_incidents, already_analyzed, save_analysis, get_dashboard_stats
router = APIRouter(
    prefix="/analyze",
    tags=["Analysis"]
)

MAX_WORKERS = 3  # safe for RTX 3050 6GB + 16GB RAM


@router.post("")
def analyze(incident: IncidentRequest):
    return analyze_incident(incident)


def _analyze_one(incident):
    """Worker function — runs in a thread."""
    try:
        result = analyze_fetched_incident(incident)
        save_analysis(incident.id, result)
        return result
    except Exception as e:
        print(f"Analysis failed for {incident.id}: {e}")
        return None


@router.get("/all")
def analyze_all(limit: int = 10):
    aggregator = IncidentAggregator()
    incidents = aggregator.fetch_all()
    save_incidents(incidents)

    pending = [i for i in incidents if not already_analyzed(i.id)][:limit]

    if not pending:
        return {"message": "No new incidents to analyze", "results": []}

    results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(_analyze_one, incident): incident
            for incident in pending
        }

        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                results.append(result)

    # Sort by priority_score descending so highest priority comes first
    results.sort(
        key=lambda x: x["analysis"].get("priority_score", 0),
        reverse=True
    )

    return results



# add this endpoint at the bottom
@router.get("/dashboard")
def dashboard():
    return get_dashboard_stats()
# api/analyze.py
# import time
# from fastapi import APIRouter
# from app.models.request import IncidentRequest
# from app.services.analyzer import analyze_incident, analyze_fetched_incident
# from app.services.aggregator import IncidentAggregator
# from app.services.store import save_incidents, already_analyzed, save_analysis

# router = APIRouter(
#     prefix="/analyze",
#     tags=["Analysis"]
# )

# REQUESTS_PER_MINUTE = 14  # stay just under 15 RPM limit
# DELAY_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE  # ~4.3 seconds


# @router.post("")
# def analyze(incident: IncidentRequest):
#     return analyze_incident(incident)


# @router.get("/all")
# def analyze_all(limit: int = 10):
#     aggregator = IncidentAggregator()
#     incidents = aggregator.fetch_all()
#     save_incidents(incidents)

#     pending = [i for i in incidents if not already_analyzed(i.id)][:limit]

#     if not pending:
#         return {"message": "No new incidents to analyze", "results": []}

#     results = []

#     for i, incident in enumerate(pending):
#         try:
#             result = analyze_fetched_incident(incident)
#             save_analysis(incident.id, result)
#             results.append(result)

#             # Rate limit guard — don't sleep after last request
#             if i < len(pending) - 1:
#                 time.sleep(DELAY_BETWEEN_REQUESTS)

#         except Exception as e:
#             print(f"Analysis failed for {incident.id}: {e}")

#     results.sort(
#         key=lambda x: x["analysis"].get("priority_score", 0),
#         reverse=True
#     )

#     return results