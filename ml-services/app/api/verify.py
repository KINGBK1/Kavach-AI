from fastapi import APIRouter
from app.models.request import IncidentRequest
from app.services.analyzer import analyze_incident
from app.services.verifier import verify_report
from app.services.parser import parse_response

router = APIRouter(
    prefix="/verify",
    tags=["Verification"],
)


@router.post("")
def verify(incident: IncidentRequest):
    print(f"[ML-VERIFY] Received: lat={incident.latitude}, lng={incident.longitude}, desc={incident.description[:60]}", flush=True)

    analysis = analyze_incident(incident)
    verification = verify_report(incident.description, incident.latitude, incident.longitude)

    processing_ms = analysis.get("metadata", {}).get("processing_time_ms", 0) + verification.get("processing_time_ms", 0)

    print(f"[ML-VERIFY] complete: is_verified={verification['is_verified']}, severity={analysis.get('analysis', {}).get('severity')}", flush=True)

    return {
        "analysis": analysis.get("analysis", {}),
        "verification": verification,
        "metadata": {
            "model": analysis.get("metadata", {}).get("model", "unknown"),
            "processing_time_ms": processing_ms,
        },
    }
