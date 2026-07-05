import json
import math
from app.core.prompts import VERIFICATION_PROMPT
from app.services.llm import ask_llm
from app.services.store import get_stored_incidents
from app.services.analyzer import analyze_incident
from app.models.request import IncidentRequest


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearby_incidents(latitude, longitude, radius_km=50, limit=10):
    all_incidents = get_stored_incidents(limit=500)
    nearby = []
    for inc in all_incidents:
        if inc.get("latitude") is None or inc.get("longitude") is None:
            continue
        dist = _haversine_km(latitude, longitude, inc["latitude"], inc["longitude"])
        if dist <= radius_km:
            nearby.append({**inc, "distance_km": round(dist, 1)})
    nearby.sort(key=lambda x: x["distance_km"])
    return nearby[:limit]


def _build_evidence_text(nearby):
    if not nearby:
        return "No corroborating incidents found from authoritative data sources near this location."
    lines = ["Nearby incidents from verified data sources:"]
    for inc in nearby:
        src = inc.get("source", "unknown")
        title = inc.get("title", "")
        cat = inc.get("category", "")
        dist = inc.get("distance_km", "?")
        sev = inc.get("severity", "unknown")
        lines.append(f"- [{src}] \"{title}\" ({cat}) at {dist}km away, severity: {sev}")
    return "\n".join(lines)


def verify_report(description, latitude, longitude):
    print(f"[VERIFY] starting verification for: lat={latitude}, lng={longitude}, desc={description[:60]}", flush=True)

    nearby = find_nearby_incidents(latitude, longitude)
    print(f"[VERIFY] found {len(nearby)} nearby incidents", flush=True)

    evidence = _build_evidence_text(nearby)
    matched_sources = list(set(inc.get("source", "unknown") for inc in nearby if inc.get("source")))

    user_prompt = f"""
User-submitted report description:
{description}

Location: {latitude}, {longitude}

{evidence}
"""

    llm_result = ask_llm(VERIFICATION_PROMPT, user_prompt)
    raw = llm_result["response"]

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[VERIFY] LLM returned invalid JSON, attempting bracket extraction", flush=True)
        import re
        match = re.search(r'\{[^{}]*"is_verified"[^{}]*\}', raw, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group())
            except json.JSONDecodeError:
                parsed = {"is_verified": False, "confidence": 0.0, "reasoning": "Failed to parse LLM response", "matched_sources": []}
        else:
            parsed = {"is_verified": False, "confidence": 0.0, "reasoning": "Failed to parse LLM response", "matched_sources": []}

    if not matched_sources and parsed.get("matched_sources"):
        matched_sources = parsed["matched_sources"]

    result = {
        "is_verified": parsed.get("is_verified", False),
        "confidence": float(parsed.get("confidence", 0.0)),
        "reasoning": parsed.get("reasoning", ""),
        "matched_sources": matched_sources,
    }

    print(f"[VERIFY] result: is_verified={result['is_verified']}, confidence={result['confidence']}, sources={matched_sources}", flush=True)
    return result
