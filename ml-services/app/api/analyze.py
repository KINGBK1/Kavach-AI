from fastapi import APIRouter
from app.models.request import IncidentRequest
from app.services.analyzer import analyze_incident, analyze_fetched_incident
from app.services.aggregator import IncidentAggregator
from app.services.store import save_incidents, already_analyzed, save_analysis, get_dashboard_stats

router = APIRouter(
    prefix="/analyze",
    tags=["Analysis"]
)

@router.post("")
def analyze(incident: IncidentRequest):
    return analyze_incident(incident)

@router.get("/all")
def analyze_all(limit: int = 10):
    aggregator = IncidentAggregator()
    incidents = aggregator.fetch_all()
    save_incidents(incidents)
    
    print(f"[ANALYZE] fetching already analyzed IDs...", flush=True)
    
    # Get all analyzed IDs in one query instead of 313 separate queries
    from app.core.db import get_conn
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT incident_id FROM analyses")
        analyzed_ids = {row["incident_id"] for row in cursor.fetchall()}
        
    print(f"[ANALYZE] {len(analyzed_ids)} already analyzed", flush=True)
    
    pending = [i for i in incidents if i.id not in analyzed_ids][:limit]
    print(f"[ANALYZE] {len(pending)} pending", flush=True)
    
    if not pending:
        return {"message": "No new incidents to analyze", "results": []}
        
    results = []
    for incident in pending:
        try:
            print(f"[ANALYZE] analyzing {incident.id}", flush=True)
            result = analyze_fetched_incident(incident)
            save_analysis(incident.id, result)
            results.append(result)
        except Exception as e:
            print(f"Analysis failed for {incident.id}: {e}", flush=True)
            
    results.sort(
        key=lambda x: x["analysis"].get("priority_score", 0),
        reverse=True
    )
    return results

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