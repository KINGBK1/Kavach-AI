from datetime import datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import desc, func, select

from app.core.db import get_session
from app.core.models import AnalysisModel, IncidentModel

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


def _normalize_timestamp(value):
    return value.isoformat() if value else None


@router.get("/history")
def history():
    cutoff = datetime.utcnow() - timedelta(days=30)
    stmt = select(
        func.date_trunc("day", IncidentModel.timestamp).label("day"),
        func.count().label("incident_count"),
    ).where(
        IncidentModel.timestamp >= cutoff
    ).group_by("day").order_by("day")

    with get_session() as session:
        rows = session.execute(stmt).all()

    return [{"day": _normalize_timestamp(row.day), "incident_count": row.incident_count} for row in rows]


@router.get("/trends")
def trends():
    cutoff = datetime.utcnow() - timedelta(days=90)
    stmt = select(
        func.date_trunc("week", AnalysisModel.analyzed_at).label("week"),
        func.avg(AnalysisModel.priority_score).label("average_priority"),
        func.count().label("analysis_count"),
    ).where(
        AnalysisModel.analyzed_at >= cutoff
    ).group_by("week").order_by("week")

    with get_session() as session:
        rows = session.execute(stmt).all()

    return [
        {
            "week": _normalize_timestamp(row.week),
            "average_priority": float(row.average_priority) if row.average_priority is not None else 0,
            "analysis_count": row.analysis_count,
        }
        for row in rows
    ]


@router.get("/categories")
def categories():
    stmt = select(
        IncidentModel.category,
        func.count().label("count"),
    ).group_by(IncidentModel.category).order_by(desc("count"))

    with get_session() as session:
        rows = session.execute(stmt).all()

    return {row.category or "Unknown": row.count for row in rows}


@router.get("/timeline")
def timeline():
    cutoff = datetime.utcnow() - timedelta(days=30)
    stmt = select(
        func.date_trunc("day", IncidentModel.timestamp).label("day"),
        func.count().label("incident_count"),
    ).where(
        IncidentModel.timestamp >= cutoff
    ).group_by("day").order_by("day")

    with get_session() as session:
        rows = session.execute(stmt).all()

    return [{"day": _normalize_timestamp(row.day), "incident_count": row.incident_count} for row in rows]


@router.get("/countries")
def countries():
    stmt = select(
        IncidentModel.country,
        func.count().label("count"),
    ).group_by(IncidentModel.country).order_by(desc("count"))

    with get_session() as session:
        rows = session.execute(stmt).all()

    return {row.country or "Unknown": row.count for row in rows}
