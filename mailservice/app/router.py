from fastapi import APIRouter

from app.config import get_radius
from app.emailer import send_alerts
from app.geolocation import find_nearby_users
from app.schemas import AlertResponse, AlertTrigger, OtpRequest, OtpResponse
from app.emailer import send_otp_email

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "healthy", "service": "KAVACH Mail Service"}


@router.post("/otp", response_model=OtpResponse)
def send_otp(payload: OtpRequest):
    print(f"[MAIL-OTP] Sending OTP to {payload.email}", flush=True)
    try:
        send_otp_email(payload.email, payload.otp)
        print(f"[MAIL-OTP] Sent to {payload.email}", flush=True)
        return OtpResponse(sent=True, message="OTP sent successfully")
    except Exception as e:
        print(f"[MAIL-OTP] Failed to send to {payload.email}: {e}", flush=True)
        return OtpResponse(sent=False, message=str(e))


@router.post("/alerts")
def trigger_alerts(payload: AlertTrigger) -> AlertResponse:
    radius = get_radius(payload.incident_type, payload.category)

    nearby = find_nearby_users(payload.latitude, payload.longitude, radius)

    if not nearby:
        return AlertResponse(
            incident_id=payload.incident_id,
            sent=0,
            failed=0,
            total_nearby=0,
            radius_used=radius,
        )

    sent, failed = send_alerts(
        recipients=nearby,
        incident_id=payload.incident_id,
        title=payload.title,
        incident_type=payload.incident_type,
        severity=payload.severity,
        summary=payload.summary or payload.description,
        recommended_actions=payload.recommended_actions,
        latitude=payload.latitude,
        longitude=payload.longitude,
        source=payload.source,
        radius_km=radius,
    )

    return AlertResponse(
        incident_id=payload.incident_id,
        sent=sent,
        failed=failed,
        total_nearby=len(nearby),
        radius_used=radius,
    )
