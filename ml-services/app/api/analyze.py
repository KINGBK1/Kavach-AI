from fastapi import APIRouter, Query
from app.models.request import IncidentRequest
from app.services.analyzer import analyze_incident
from app.services.store import get_dashboard_stats, get_stored_analyses

router = APIRouter(
    prefix="/analyze",
    tags=["Analysis"]
)

@router.post("")
def analyze(incident: IncidentRequest):
    return analyze_incident(incident)

@router.get("/all")
def analyze_all(limit: int = Query(default=50, ge=1, le=2000)):
    """
    Reads already-computed analyses from Postgres. Fetching + running Gemini
    on new incidents happens only in the background scheduler
    (services/scheduler.py) — this endpoint never triggers live connector
    calls or Gemini calls itself, so it stays fast regardless of load.
    """
    return get_stored_analyses(limit=limit)

@router.get("/dashboard")
def dashboard():
    return get_dashboard_stats()