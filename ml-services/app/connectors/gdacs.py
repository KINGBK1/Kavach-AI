import requests
from datetime import datetime

from app.connectors.base import BaseConnector
from app.models.incident import Incident

GDACS_URL = (
    "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?format=json"
)


class GDACSConnector(BaseConnector):

    def fetch(self):
        response = requests.get(
            GDACS_URL,
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def normalize(self, raw_data):

        incidents = []

        for feature in raw_data.get("features", []):

            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})

            coordinates = geometry.get("coordinates", [])

            if len(coordinates) < 2:
                continue

            lon = coordinates[0]
            lat = coordinates[1]

            # -------------------------
            # Handle GDACS URL object
            # -------------------------

            url = None

            url_data = props.get("url")

            if isinstance(url_data, str):
                url = url_data

            elif isinstance(url_data, dict):

                # Pick whichever exists
                url = (
                    url_data.get("details")
                    or url_data.get("geometry")
                    or next(
                        (
                            v
                            for v in url_data.values()
                            if isinstance(v, str)
                        ),
                        None,
                    )
                )

            # -------------------------

            timestamp = None

            date = props.get("fromdate")

            if date:
                try:
                    timestamp = datetime.fromisoformat(
                        date.replace("Z", "+00:00")
                    )
                except Exception:
                    pass

            incidents.append(
                Incident(
                    id=str(props.get("eventid", "")),
                    source="GDACS",
                    title=props.get("name", "Unknown Event"),
                    description=props.get("description", ""),
                    category=props.get("eventtype", "Unknown"),
                    latitude=lat,
                    longitude=lon,
                    severity=props.get("alertlevel"),
                    timestamp=timestamp,
                    url=url,
                )
            )

        return incidents