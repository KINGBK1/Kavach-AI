import requests

from app.connectors.base import BaseConnector
from app.models.incident import Incident


NASA_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"


class NASAConnector(BaseConnector):

    def fetch(self):
        response = requests.get(
            NASA_URL,
            timeout=10,
        )

        response.raise_for_status()

        return response.json()

    def normalize(self, raw_data):

        incidents = []

        for event in raw_data.get("events", []):

            geometry = event.get("geometry", [])

            if not geometry:
                continue

            latest = geometry[-1]

            coordinates = latest.get("coordinates")

            if not coordinates:
                continue

            lon, lat = coordinates

            incidents.append(
                Incident(
                    id=event["id"],
                    source="NASA EONET",
                    title=event["title"],
                    description=event["title"],
                    category=event["categories"][0]["title"],
                    latitude=lat,
                    longitude=lon,
                    timestamp=latest.get("date"),
                    url=event.get("sources", [{}])[0].get("url"),
                )
            )

        return incidents