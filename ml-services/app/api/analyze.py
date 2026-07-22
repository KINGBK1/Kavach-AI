from fastapi import APIRouter, Query, HTTPException
from app.models.request import IncidentRequest
from app.models.incident import Incident
from app.services.analyzer import analyze_incident, analyze_fetched_incident
from app.services.store import get_dashboard_stats, get_stored_analyses
from app.services.citizen_reports import (
    check_rate_limit,
    find_corroborating_incidents,
    save_citizen_report,
    get_citizen_reports,
)

router = APIRouter(
    prefix="/analyze",
    tags=["Analysis"]
)

@router.post("")
def analyze(incident: IncidentRequest):
    print(f"[ML-ANALYZE] Received analysis request: lat={incident.latitude}, lng={incident.longitude}, desc={incident.description[:60]}", flush=True)
    result = analyze_incident(incident)
    analysis = result.get("analysis", {})
    print(f"[ML-ANALYZE] Analysis complete: severity={analysis.get('severity')}, type={analysis.get('incident_type')}", flush=True)
    return result


class CitizenReportRequest(IncidentRequest):
    category: str | None = None
    reported_by: str | None = None  


@router.post("/citizen-report")
def analyze_citizen_report(report: CitizenReportRequest):
    allowed, recent_count = check_rate_limit(report.reported_by)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {recent_count} reports in the last hour.",
        )

    category = report.category or "Other"

    print(f"[ML-CITIZEN] Received citizen report: lat={report.latitude}, lng={report.longitude}, category={category}", flush=True)

    throwaway_incident = Incident(
        id="citizen-pending",
        source="citizen-report",
        title=report.description[:80] if report.description else "Citizen Report",
        description=report.description,
        category=category,
        latitude=report.latitude,
        longitude=report.longitude,
        severity=None,
        timestamp=None,
        url=None,
        location=None,
        country=None,
    )
    result = analyze_fetched_incident(throwaway_incident)

    corroborating = find_corroborating_incidents(report.latitude, report.longitude, category)
    status = "corroborated" if corroborating else "unverified"

    report_id = save_citizen_report(
        description=report.description,
        latitude=report.latitude,
        longitude=report.longitude,
        category=category,
        analysis=result["analysis"],
        reported_by=report.reported_by,
        status=status,
    )

    print(f"[ML-CITIZEN] Saved report {report_id} as status={status} ({len(corroborating)} corroborating incidents)", flush=True)

    return {
        "report_id": report_id,
        "status": status,
        "corroborating_incidents": corroborating,
        "analysis": result["analysis"],
        "metadata": result["metadata"],
    }


@router.get("/citizen-reports")
def list_citizen_reports(status: str | None = Query(default=None), limit: int = Query(default=100, ge=1, le=500)):
    return get_citizen_reports(status=status, limit=limit)


@router.get("/all")
def analyze_all(limit: int = Query(default=50, ge=1, le=50000)):
    return get_stored_analyses(limit=limit)

@router.get("/dashboard")
def dashboard():
    return get_dashboard_stats()
