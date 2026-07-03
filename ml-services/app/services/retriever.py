import json
from typing import Any

from sqlalchemy import and_, desc, func, or_, select

from app.core.db import get_session
from app.core.models import AnalysisModel, IncidentModel
from app.services.query_parser import parse_query, time_range_bounds


def _build_time_filter(parsed: dict[str, Any]) -> list[Any]:
    filters = []
    start, end = time_range_bounds(parsed.get("time_range"))
    if start is not None:
        filters.append(IncidentModel.timestamp >= start)
    if end is not None:
        filters.append(IncidentModel.timestamp <= end)
    return filters


def _build_location_filter(parsed: dict[str, Any]) -> list[Any]:
    filters = []
    location = parsed.get("location")
    if location:
        like_value = f"%{location}%"
        filters.append(
            or_(
                func.lower(IncidentModel.location).like(like_value.lower()),
                func.lower(IncidentModel.country).like(like_value.lower()),
                func.lower(IncidentModel.title).like(like_value.lower()),
                func.lower(IncidentModel.description).like(like_value.lower()),
            )
        )
    return filters


def _build_category_filter(parsed: dict[str, Any]) -> list[Any]:
    category = parsed.get("category")
    if not category:
        return []
    return [func.lower(IncidentModel.category) == category.lower()]


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
        result.update({
            "incident_type": analysis.incident_type,
            "priority_score": analysis.priority_score,
            "confidence": analysis.confidence,
            "summary": analysis.summary,
            "recommended_actions": json.loads(analysis.recommended_actions) if analysis.recommended_actions else [],
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


def retrieve_incidents(question: str) -> list[dict[str, Any]]:
    parsed = parse_query(question)
    stmt = _build_query(parsed)
    with get_session() as session:
        rows = session.execute(stmt).all()
    return [parse_result(row) for row in rows]