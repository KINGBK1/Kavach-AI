# import json
# import re

# from app.models.response import IncidentResponse


# def parse_response(raw: str) -> IncidentResponse:

#     cleaned = raw.strip()

#     cleaned = re.sub(r"^```json", "", cleaned)
#     cleaned = re.sub(r"```$", "", cleaned)

#     cleaned = cleaned.strip()

#     data = json.loads(cleaned)

#     return IncidentResponse(**data)


import json
import re

from app.models.response import IncidentResponse


def parse_response(raw: str) -> IncidentResponse:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```json", "", cleaned)
    cleaned = re.sub(r"```$", "", cleaned)
    cleaned = cleaned.strip()

    data = json.loads(cleaned)

    # Coerce types Gemini might get wrong
    if "confidence" in data:
        data["confidence"] = float(data["confidence"])
    if "priority_score" in data:
        data["priority_score"] = int(data["priority_score"])

    return IncidentResponse(**data)