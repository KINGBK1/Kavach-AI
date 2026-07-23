import math
from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import desc, func, select, text

from app.core.db import get_conn, get_session
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


@router.get("/risk-zones")
def risk_zones(grid_size: float = Query(default=2.0, ge=0.5, le=10.0)):
    """
    Aggregate all historical incidents by grid cell (lat_bucket, lng_bucket),
    category, and calendar month. Returns data suitable for rendering a
    historical risk heat overlay on the map — no ML, just honest counting.

    Each result cell includes:
      - lat_bucket, lng_bucket: center of the grid cell
      - category: incident category
      - month: calendar month (1-12)
      - count: how many incidents of this category occurred in this cell+month
      - total: total incidents in this cell across all categories
    """
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT
                ROUND(latitude / {grid_size}) * {grid_size} AS lat_bucket,
                ROUND(longitude / {grid_size}) * {grid_size} AS lng_bucket,
                category,
                EXTRACT(MONTH FROM timestamp)::int AS month,
                COUNT(*) AS count
            FROM incidents
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND timestamp IS NOT NULL
            GROUP BY lat_bucket, lng_bucket, category, month
            ORDER BY count DESC
            """
        )
        rows = cursor.fetchall()

    if not rows:
        return []

    totals = {}
    for r in rows:
        key = (r["lat_bucket"], r["lng_bucket"])
        totals[key] = totals.get(key, 0) + r["count"]

    result = []
    for r in rows:
        key = (r["lat_bucket"], r["lng_bucket"])
        result.append({
            "lat_bucket": float(r["lat_bucket"]),
            "lng_bucket": float(r["lng_bucket"]),
            "category": r["category"],
            "month": r["month"],
            "count": r["count"],
            "total_in_cell": totals[key],
        })

    return result
