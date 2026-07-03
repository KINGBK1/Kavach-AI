from datetime import datetime
import time

import requests

from app.connectors.base import BaseConnector
from app.models.incident import Incident

RELIEFWEB_URL = "https://api.reliefweb.int/v1/reports"
RELIEFWEB_PARAMS = {
    "appname": "varuna",
    "limit": "100",
    "sort[]": "date:desc",
    "profile": "full",
    "format": "json",
    "query": (
        "Flood Earthquake Cyclone Hurricane Wildfire Volcano Landslide "
        "Tsunami Drought Heatwave Storm"
    ),
}

CATEGORY_KEYWORDS = [
    ("earthquake", "Earthquake"),
    ("flood", "Flood"),
    ("wildfire", "Wildfire"),
    ("fire", "Wildfire"),
    ("cyclone", "Cyclone"),
    ("typhoon", "Cyclone"),
    ("hurricane", "Cyclone"),
    ("volcano", "Volcano"),
    ("landslide", "Landslide"),
    ("tsunami", "Tsunami"),
    ("drought", "Drought"),
    ("heatwave", "Heatwave"),
    ("heat", "Heatwave"),
    ("storm", "Storm"),
    ("conflict", "Conflict"),
    ("war", "Conflict"),
    ("disease", "Disease"),
    ("epidemic", "Disease"),
    ("pandemic", "Disease"),
]


class ReliefWebConnector(BaseConnector):

    def fetch(self):
        attempts = 3

        for attempt in range(1, attempts + 1):
            try:
                response = requests.get(
                    RELIEFWEB_URL,
                    params=RELIEFWEB_PARAMS,
                    timeout=10,
                    headers={"User-Agent": "VARUNA ML Services/1.0"},
                )

            except requests.RequestException:
                if attempt < attempts:
                    time.sleep(2 ** attempt)
                    continue
                raise

            # Handle permanent 'Gone' responses: treat as empty dataset
            if response.status_code == 410:
                print("[AGG] reliefweb returned 410 Gone — returning empty dataset", flush=True)
                return {"data": []}

            # Respect rate limiting if present
            if response.status_code == 429 and attempt < attempts:
                retry_after = response.headers.get("Retry-After")
                try:
                    wait = int(retry_after)
                except Exception:
                    wait = 2 ** attempt

                time.sleep(min(wait, 30))
                continue

            response.raise_for_status()
            return response.json()

        # Exhausted retries
        response.raise_for_status()

    def normalize(self, raw_data):
        incidents = []

        reports = raw_data.get("data") or []

        if not isinstance(reports, list):
            return incidents

        for report in reports:
            if not isinstance(report, dict):
                continue

            report_id = report.get("id")
            if not report_id:
                continue
            fields = report.get("fields", {})

            title = self._extract_text(fields.get("title"))
            if not title:
                continue

            description = self._extract_text(
                fields.get("summary")
                or fields.get("body")
                or fields.get("text")
                or title
            )

            url = self._extract_url(report, fields)
            if not url:
                continue

            timestamp = self._parse_timestamp(fields)
            country = self._extract_country(fields)
            category = self._infer_category(title)

            incidents.append(
                Incident(
                    id=f"RELIEF_{report_id}",
                    source="ReliefWeb",
                    title=title,
                    description=description,
                    category=category,
                    latitude=None,
                    longitude=None,
                    timestamp=timestamp,
                    url=url,
                    country=country,
                    location=country,
                )
            )

        return incidents

    def _extract_text(self, value):
        if isinstance(value, str):
            return value.strip()

        if isinstance(value, list) and value:
            first = value[0]
            if isinstance(first, str):
                return first.strip()

        return ""

    def _extract_url(self, report, fields):
        url = fields.get("url") or report.get("href")

        if isinstance(url, list):
            for item in url:
                if isinstance(item, str):
                    return item
                if isinstance(item, dict):
                    candidate = item.get("url") or item.get("href")
                    if isinstance(candidate, str):
                        return candidate

        if isinstance(url, dict):
            candidate = url.get("url") or url.get("href")
            if isinstance(candidate, str):
                return candidate

        if isinstance(url, str) and url:
            return url

        return None

    def _extract_country(self, fields):
        country_value = fields.get("country") or fields.get("primary_country")

        if isinstance(country_value, list) and country_value:
            first = country_value[0]
            if isinstance(first, dict):
                return first.get("name") or first.get("country")
            if isinstance(first, str):
                return first

        if isinstance(country_value, dict):
            return country_value.get("name") or country_value.get("country")

        if isinstance(country_value, str):
            return country_value

        return None

    def _parse_timestamp(self, fields):
        for key in ("date", "published", "created", "updated"):
            value = fields.get(key)

            if isinstance(value, dict):
                value = value.get("published") or value.get("date")

            if isinstance(value, str):
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00"))
                except Exception:
                    pass

            if isinstance(value, int):
                try:
                    return datetime.fromtimestamp(value)
                except Exception:
                    pass

        return None

    def _infer_category(self, title):
        title_lower = title.lower()

        for keyword, category in CATEGORY_KEYWORDS:
            if keyword in title_lower:
                return category

        return "Disaster"
