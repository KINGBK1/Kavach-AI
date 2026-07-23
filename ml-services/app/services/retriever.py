import json
from typing import Any

from sqlalchemy import and_, desc, func, or_, select

from app.core.db import get_session
from app.core.models import AnalysisModel, IncidentModel
from app.services.query_parser import parse_query, time_range_bounds


GEO_BOUNDS = [
    {"country": "India", "lat_min": 6.5, "lat_max": 35.5, "lng_min": 68.0, "lng_max": 97.4},
    {"country": "United States", "lat_min": 24.5, "lat_max": 49.4, "lng_min": -124.8, "lng_max": -66.9},
    {"country": "Japan", "lat_min": 30.0, "lat_max": 45.0, "lng_min": 128.0, "lng_max": 146.0},
    {"country": "United Kingdom", "lat_min": 49.9, "lat_max": 60.8, "lng_min": -8.6, "lng_max": 1.7},
    {"country": "Australia", "lat_min": -44.0, "lat_max": -10.0, "lng_min": 112.0, "lng_max": 154.0},
    {"country": "Canada", "lat_min": 42.0, "lat_max": 83.0, "lng_min": -141.0, "lng_max": -52.0},
    {"country": "Germany", "lat_min": 47.2, "lat_max": 55.1, "lng_min": 5.8, "lng_max": 15.0},
    {"country": "France", "lat_min": 42.3, "lat_max": 51.1, "lng_min": -4.8, "lng_max": 8.2},
    {"country": "China", "lat_min": 18.0, "lat_max": 53.6, "lng_min": 73.5, "lng_max": 134.8},
    {"country": "Russia", "lat_min": 41.0, "lat_max": 82.0, "lng_min": 19.0, "lng_max": 180.0},
    {"country": "Brazil", "lat_min": -33.8, "lat_max": 5.3, "lng_min": -74.0, "lng_max": -34.7},
    {"country": "Indonesia", "lat_min": -11.0, "lat_max": 6.0, "lng_min": 95.0, "lng_max": 141.0},
    {"country": "Mexico", "lat_min": 14.5, "lat_max": 32.5, "lng_min": -118.4, "lng_max": -86.7},
    {"country": "Turkey", "lat_min": 36.0, "lat_max": 42.1, "lng_min": 26.0, "lng_max": 44.8},
]


def _resolve_country(lat: float | None, lng: float | None) -> str | None:
    if lat is None or lng is None:
        return None
    for b in GEO_BOUNDS:
        if b["lat_min"] <= lat <= b["lat_max"] and b["lng_min"] <= lng <= b["lng_max"]:
            return b["country"]
    return None


DISASTER_CATEGORIES = {
    "cyclone",
    "drought",
    "earthquake",
    "fire",
    "flood",
    "landslide",
    "storm",
    "tsunami",
    "volcano",
    "wildfire",
    "wildfires",
}

DISASTER_TERMS = [
    "cyclone",
    "drought",
    "earthquake",
    "fire",
    "flood",
    "hurricane",
    "landslide",
    "storm",
    "tsunami",
    "typhoon",
    "volcano",
    "wildfire",
]

NON_DISASTER_TERMS = [
    "election",
    "modi",
    "mookerjee",
    "parliament",
    "political",
    "politics",
    "prime minister",
    "vehicle insurance",
    "car insurance",
]


def _build_time_filter(parsed: dict[str, Any]) -> list[Any]:
    filters = []
    start, end = time_range_bounds(parsed.get("time_range"))
    if start is not None:
        filters.append(IncidentModel.timestamp >= start)
    if end is not None:
        filters.append(IncidentModel.timestamp <= end)
    return filters


def _build_location_filter(parsed: dict[str, Any]) -> list[Any]:
    """Match the parsed location as a whole word, not a raw substring.

    A plain '%india%' LIKE match also matches 'Indiana', 'Indian Ocean', etc.
    Using word-boundary patterns (space/start/end/punctuation on both sides)
    avoids these false positives while still working with a simple LIKE.
    """
    filters = []
    location = parsed.get("location")
    if location:
        loc = location.lower()
        patterns = [
            loc,                # exact match e.g. country == "india"
            f"{loc} %",         # starts with "india ..."
            f"% {loc}",         # ends with "... india"
            f"% {loc} %",       # "... india ..."
            f"{loc},%",         # "india, foo"
            f"%,{loc}",         # "foo,india"
            f"%,{loc},%",       # "foo,india,bar"
            f"%,{loc} %",
            f"% {loc},%",
        ]

        def word_match(column):
            return or_(*[func.lower(column).like(p) for p in patterns])

        filters.append(
            or_(
                word_match(IncidentModel.location),
                word_match(IncidentModel.country),
                word_match(IncidentModel.title),
                word_match(IncidentModel.description),
            )
        )
    return filters


def _build_category_filter(parsed: dict[str, Any]) -> list[Any]:
    category = parsed.get("category")
    if not category:
        return []
    return [func.lower(IncidentModel.category) == category.lower()]


def _build_disaster_filter(parsed: dict[str, Any]) -> list[Any]:
    if not parsed.get("disaster_only", True):
        return []

    category_match = func.lower(IncidentModel.category).in_(DISASTER_CATEGORIES)

    def text_has_any(terms):
        return or_(
            *[
                or_(
                    func.lower(IncidentModel.title).like(f"%{term}%"),
                    func.lower(IncidentModel.description).like(f"%{term}%"),
                )
                for term in terms
            ]
        )

    disaster_text_match = text_has_any(DISASTER_TERMS)
    non_disaster_text_match = text_has_any(NON_DISASTER_TERMS)

    return [
        or_(category_match, disaster_text_match),
        ~non_disaster_text_match,
    ]


def _build_query(parsed: dict[str, Any]) -> Any:
    base = select(
        IncidentModel,
        AnalysisModel,
    ).join(
        AnalysisModel,
        IncidentModel.id == AnalysisModel.incident_id,
        isouter=True,
    )

    filters = []
    filters.extend(_build_time_filter(parsed))
    filters.extend(_build_location_filter(parsed))
    filters.extend(_build_category_filter(parsed))
    filters.extend(_build_disaster_filter(parsed))

    if filters:
        base = base.where(and_(*filters))

    intent = parsed.get("intent")
    limit = parsed.get("limit") or 10

    if intent in {"critical", "top", "recent", "summary", "list"}:
        base = base.order_by(AnalysisModel.priority_score.desc().nullslast())
    elif intent in {"count", "statistics"}:
        base = base.order_by(IncidentModel.timestamp.desc().nullslast())
    else:
        base = base.order_by(IncidentModel.timestamp.desc().nullslast())

    return base.limit(limit)


def parse_result(row: Any) -> dict[str, Any]:
    incident, analysis = row
    location = incident.location
    country = incident.country
    # If location/country is missing, infer from coordinates so the LLM
    # can answer questions like "which region has the most incidents?"
    if not country and incident.latitude is not None:
        country = _resolve_country(incident.latitude, incident.longitude)
    if not location:
        location = country
    result = {
        "incident_id": incident.id,
        "source": incident.source,
        "title": incident.title,
        "description": incident.description,
        "category": incident.category,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "severity": incident.severity,
        "timestamp": incident.timestamp.isoformat() if incident.timestamp else None,
        "url": incident.url,
        "location": location,
        "country": country,
    }
    if analysis is not None:
        raw_actions = analysis.recommended_actions
        # Defensive: recommended_actions is declared TEXT and is normally
        # written via json.dumps() (see store.py save_analysis()), so it's
        # a JSON string that needs loads(). But some rows — likely written
        # before this codebase settled on that convention, or via a path
        # that bound a native list directly — come back from the DB
        # already deserialized as a Python list. Handle both shapes rather
        # than assuming one, so a handful of old/irregular rows don't 500
        # the whole chat endpoint.
        if isinstance(raw_actions, list):
            parsed_actions = raw_actions
        elif raw_actions:
            try:
                parsed_actions = json.loads(raw_actions)
            except (TypeError, ValueError):
                parsed_actions = []
        else:
            parsed_actions = []

        result.update({
            "incident_type": analysis.incident_type,
            "priority_score": analysis.priority_score,
            "confidence": analysis.confidence,
            "summary": analysis.summary,
            "recommended_actions": parsed_actions,
        })
    else:
        result.update({
            "incident_type": None,
            "priority_score": None,
            "confidence": None,
            "summary": None,
            "recommended_actions": [],
        })
    return result


def retrieve_incidents(question: str, parsed: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Retrieve incidents matching the question.

    If `parsed` is provided (e.g. already computed by the caller), it is
    reused instead of re-parsing the question, so retrieval and the rest
    of the pipeline always agree on the same filters.
    """
    if parsed is None:
        parsed = parse_query(question)
    stmt = _build_query(parsed)
    with get_session() as session:
        rows = session.execute(stmt).all()
    return [parse_result(row) for row in rows]