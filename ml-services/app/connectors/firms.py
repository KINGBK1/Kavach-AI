import os
import csv
import io
import requests
from datetime import datetime, timezone

from app.models.incident import Incident


class FIRMSConnector:

    def __init__(self):
        self.api_key = os.getenv("FIRMS_API_KEY")

        self.satellites = [
            "VIIRS_SNPP_NRT",
            "VIIRS_NOAA20_NRT",
        ]

    def fetch(self):
        """
        Download hotspot data from both VIIRS satellites.
        """

        rows = []

        for satellite in self.satellites:

            url = (
                "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
                f"{self.api_key}/{satellite}/-180,-90,180,90/1"
            )

            response = requests.get(url, timeout=60)
            response.raise_for_status()

            rows.extend(response.text.splitlines())

        # Remove duplicate CSV lines
        rows = list(dict.fromkeys(rows))

        return "\n".join(rows)

    def normalize(self, raw):

        incidents = []

        reader = csv.reader(io.StringIO(raw))

        seen = set()

        for row in reader:

            try:

                lat = float(row[0])
                lon = float(row[1])

                brightness = float(row[2])

                date = row[5]
                time = row[6]

                confidence = row[10].lower()

                frp = float(row[12])

                # Ignore weak detections
                if confidence == "l":
                    continue

                if brightness < 320:
                    continue

                if frp < 5:
                    continue

                uid = f"{lat:.4f}_{lon:.4f}_{date}_{time}"

                if uid in seen:
                    continue

                seen.add(uid)

                # Severity calculation
                if confidence == "h" or frp > 150:
                    severity = "Critical"

                elif frp > 75:
                    severity = "High"

                elif confidence == "n":
                    severity = "Moderate"

                else:
                    severity = "Low"

                incidents.append(
                    Incident(
                        id=f"FIRMS_{uid}",
                        source="NASA FIRMS",
                        title="Active Wildfire Hotspot",
                        description=(
                            f"Satellite detected an active wildfire "
                            f"(FRP {frp:.1f} MW, Brightness {brightness:.1f} K)"
                        ),
                        category="Wildfires",
                        latitude=lat,
                        longitude=lon,
                        severity=severity,
                        timestamp=datetime(
                            int(date[:4]), int(date[5:7]), int(date[8:10]),
                            int(time[:2]), int(time[2:]),
                            tzinfo=timezone.utc
                        ),
                        url="https://firms.modaps.eosdis.nasa.gov/",
                    )
                )

            except Exception:
                continue

        return incidents