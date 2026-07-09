import requests

from app.connectors.base import BaseConnector
from app.models.incident import Incident
from datetime import datetime, UTC
USGS_URL = (
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
)


class USGSConnector(BaseConnector):

    def fetch(self):
        response = requests.get(
            USGS_URL,
            timeout=10,
        )

        response.raise_for_status()

        return response.json()

    def normalize(self, raw_data):

        incidents = []

        for feature in raw_data.get("features", []):

            props = feature["properties"]
            geometry = feature["geometry"]

            lon, lat, *_ = geometry["coordinates"]

            magnitude = props.get("mag")

            if magnitude is None:
                severity = "Unknown"
            elif magnitude < 3:
                severity = "Low"
            elif magnitude < 5:
                severity = "Moderate"
            elif magnitude < 7:
                severity = "High"
            else:
                severity = "Critical"

            # Earthquakes are point-in-time events — there's no "ongoing"
            # state to track (unlike a wildfire or flood), so we explicitly
            # mark status "resolved" rather than leaving it "unknown". This
            # means USGS incidents rely on the recency window (timestamp vs
            # now) for "does this still matter", not on being called
            # "active" — which would be misleading for an event that
            # finished the instant it happened.
            incidents.append(
                Incident(
                    id=feature["id"],
                    source="USGS",
                    title=props["title"],
                    description=props.get("place", ""),
                    category="Earthquake",
                    latitude=lat,
                    longitude=lon,
                    severity=severity,
                    timestamp=datetime.fromtimestamp(
                        props["time"] / 1000,
                        tz=UTC,
                    ),
                    url=props.get("url"),
                    status="resolved",
                    source_updated_at=datetime.fromtimestamp(
                        props["updated"] / 1000,
                        tz=UTC,
                    ) if props.get("updated") else None,
                )
            )

        return incidents