from fastapi import APIRouter, Query

from app.connectors.usgs import USGSConnector
from app.connectors.weather import WeatherConnector
from app.connectors.nasa import NASAConnector
from app.connectors.gdacs import GDACSConnector
from app.connectors.reddit import RedditConnector
from app.connectors.bluesky import BlueskyConnector
from app.connectors.firms import FIRMSConnector

from app.services.aggregator import IncidentAggregator

router = APIRouter(
    prefix="/sources",
    tags=["Sources"],
)


@router.get("/nasa")
def nasa_events(limit: int = Query(default=20, ge=1, le=100)):

    connector = NASAConnector()

    raw = connector.fetch()

    incidents = connector.normalize(raw)

    return incidents[:limit]

@router.get("/usgs")
def usgs_events(limit: int = Query(default=20, ge=1, le=100)):

    connector = USGSConnector()

    raw = connector.fetch()

    incidents = connector.normalize(raw)

    return incidents[:limit]

@router.get("/weather")
def weather(
    latitude: float,
    longitude: float,
):

    connector = WeatherConnector()

    return connector.fetch(latitude, longitude)

@router.get("/gdacs")
def gdacs_events(limit: int = 20):

    connector = GDACSConnector()

    raw = connector.fetch()

    incidents = connector.normalize(raw)

    return incidents[:limit]

@router.get("/reddit")
def reddit(query: str):

    connector = RedditConnector()

    raw = connector.fetch(query)

    return connector.normalize(raw)

@router.get("/bluesky")
def bluesky(query: str, limit: int = 20):

    connector = BlueskyConnector()

    raw = connector.fetch(query, limit)

    incidents = connector.normalize(raw)

    return incidents

@router.get("/firms")
def firms_hotspots(limit: int = Query(default=20, ge=1, le=100)):
    connector = FIRMSConnector()
    raw = connector.fetch()
    incidents = connector.normalize(raw)
    return incidents[:limit]

@router.get("/all")
def all_sources():

    service = IncidentAggregator()

    return service.fetch_all()
