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

            # --- Real lifecycle fields, straight from GDACS -------------
            # GDACS is one of the only free sources that actually tracks
            # whether a disaster is ongoing. `iscurrent` is a string
            # "true"/"false" in their API, not a real bool, so compare
            # case-insensitively against the string rather than relying on
            # Python truthiness of the string itself (which would treat
            # "false" as truthy since it's a non-empty string).
            iscurrent_raw = str(props.get("iscurrent", "")).strip().lower()
            if iscurrent_raw == "true":
                status = "active"
            elif iscurrent_raw == "false":
                status = "resolved"
            else:
                status = "unknown"

            def _parse_gdacs_dt(value):
                if not value:
                    return None
                try:
                    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                except Exception:
                    return None

            source_updated_at = _parse_gdacs_dt(props.get("datemodified"))
            expected_end = _parse_gdacs_dt(props.get("todate"))

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
                    status=status,
                    source_updated_at=source_updated_at,
                    expected_end=expected_end,
                )
            )

        return incidents