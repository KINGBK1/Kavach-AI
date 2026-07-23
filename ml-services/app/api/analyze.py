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
from app.services.incident_agent import run_agent
from app.core.config import MODEL_NAME

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
async def analyze_citizen_report(report: CitizenReportRequest):
    allowed, recent_count = check_rate_limit(report.reported_by)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {recent_count} reports in the last hour.",
        )

    category = report.category or "Other"

    print(f"[ML-CITIZEN] Received citizen report: lat={report.latitude}, lng={report.longitude}, category={category}", flush=True)

    try:
        agent_result = await run_agent(
            description=report.description,
            latitude=report.latitude,
            longitude=report.longitude,
            category=category,
            reported_by=str(report.reported_by) if report.reported_by else "anonymous",
        )
        print(f"[ML-CITIZEN] Agent result: status={agent_result.get('status')}", flush=True)
    except Exception as e:
        print(f"[ML-CITIZEN] ADK agent failed, falling back to direct LLM: {e}", flush=True)
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
        fallback = analyze_fetched_incident(throwaway_incident)

        corroborating = find_corroborating_incidents(report.latitude, report.longitude, category)
        fallback_status = "corroborated" if corroborating else "unverified"

        report_id = save_citizen_report(
            description=report.description,
            latitude=report.latitude,
            longitude=report.longitude,
            category=category,
            analysis=fallback["analysis"],
            reported_by=report.reported_by,
            status=fallback_status,
        )

        return {
            "report_id": report_id,
            "status": fallback_status,
            "corroborating_incidents": corroborating,
            "analysis": fallback["analysis"],
            "metadata": fallback["metadata"],
        }

    analysis = agent_result.get("analysis", {})
    verification = analysis.get("verification", {})

    is_verified = verification.get("is_verified", False)
    status = "verified" if is_verified else "rejected"

    sources_checked = verification.get("sources_checked", [])
    corroborating = agent_result.get("corroborating_incidents", [])

    report_id = save_citizen_report(
        description=report.description,
        latitude=report.latitude,
        longitude=report.longitude,
        category=category,
        analysis=analysis,
        reported_by=report.reported_by,
        status=status,
    )

    print(f"[ML-CITIZEN] Saved report {report_id} as status={status} ({len(sources_checked)} sources)", flush=True)

    return {
        "report_id": report_id,
        "status": status,
        "corroborating_incidents": corroborating,
        "analysis": analysis,
        "metadata": {"model": MODEL_NAME, "processing_time_ms": 0},
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
