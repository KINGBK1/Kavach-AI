from pydantic import BaseModel


class OtpRequest(BaseModel):
    email: str
    otp: str


class OtpResponse(BaseModel):
    sent: bool
    message: str


class AlertTrigger(BaseModel):
    incident_id: str
    title: str
    description: str
    summary: str | None = None
    recommended_actions: list[str] = []
    latitude: float | None = None
    longitude: float | None = None
    category: str
    incident_type: str
    severity: str
    source: str


class AlertResponse(BaseModel):
    incident_id: str
    sent: int
    failed: int
    total_nearby: int
    radius_used: float
