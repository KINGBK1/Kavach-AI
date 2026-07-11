import json
import re

from app.models.response import IncidentResponse


def parse_response(raw: str) -> IncidentResponse:
    try:
        cleaned = raw.strip()
        cleaned = re.sub(r"^```json", "", cleaned)
        cleaned = re.sub(r"```$", "", cleaned)
        cleaned = cleaned.strip()

        data = json.loads(cleaned)

        if "confidence" in data:
            data["confidence"] = float(data["confidence"])
        if "priority_score" in data:
            data["priority_score"] = int(data["priority_score"])

        return IncidentResponse(**data)
    except Exception:
        return IncidentResponse(
            incident_type="unknown",
            severity="Moderate",
            priority_score=50,
            confidence=0.5,
            summary="Analysis failed to parse LLM response.",
            recommended_actions=["Review incident manually"],
        )