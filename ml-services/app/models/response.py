from typing import Optional
from pydantic import BaseModel


class IncidentResponse(BaseModel):
    incident_type: str
    severity: str
    priority_score: int
    confidence: float
    summary: str
    recommended_actions: list[str]
    verification: Optional[dict] = None