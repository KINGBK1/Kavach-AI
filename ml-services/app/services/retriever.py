import json
from typing import Any

from sqlalchemy import and_, desc, func, or_, select

from app.core.db import get_session
from app.core.models import AnalysisModel, IncidentModel
from app.services.query_parser import parse_query, time_range_bounds


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
        "location": incident.location,
        "country": incident.country,
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