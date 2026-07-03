import hashlib
import time
from datetime import datetime

import requests

from app.connectors.base import BaseConnector
from app.models.incident import Incident

GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_QUERY = (
    "(earthquake OR flood OR wildfire OR cyclone OR hurricane OR volcano OR landslide OR tsunami OR drought)"
)
GDELT_PARAMS = {
    "query": GDELT_QUERY,
    "mode": "ArtList",
    "maxrecords": "100",
    "format": "json",
    "sort": "DateDesc",
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
]


class GDELTNewsConnector(BaseConnector):

    def fetch(self):
        attempts = 5

        for attempt in range(1, attempts + 1):
            response = requests.get(
                GDELT_DOC_URL,
                params=GDELT_PARAMS,
                timeout=10,
                headers={"User-Agent": "VARUNA ML Services/1.0"},
            )

            if response.status_code == 429:
                if attempt >= attempts:
                    break

                retry_after = response.headers.get("Retry-After")
                try:
                    wait = int(retry_after)
                except Exception:
                    wait = 2 ** attempt

                time.sleep(min(wait, 30))
                continue

            response.raise_for_status()
            return response.json()

        response.raise_for_status()

    def normalize(self, raw_data):
        incidents = []

        articles = raw_data.get("articles") or raw_data.get("documents") or []

        if not isinstance(articles, list):
            return incidents

        for article in articles:
            if not isinstance(article, dict):
                continue

            url = article.get("url") or article.get("sourceurl") or article.get("source_url")
            title = article.get("title") or article.get("documenttitle") or ""

            if not url or not title:
                continue

            description = article.get("snippet") or article.get("description") or title
            category = self._infer_category(title)
            timestamp = self._parse_timestamp(article)

            incidents.append(
                Incident(
                    id=self._build_id(url),
                    source="GDELT News",
                    title=title,
                    description=description,
                    category=category,
                    latitude=None,
                    longitude=None,
                    timestamp=timestamp,
                    url=url,
                )
            )

        return incidents

    def _infer_category(self, title):
        title_lower = title.lower()

        for keyword, category in CATEGORY_KEYWORDS:
            if keyword in title_lower:
                return category

        return "Disaster"

    def _build_id(self, url):
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return f"GDELTNEWS_{digest}"

    def _parse_timestamp(self, article):
        for key in ("seendate", "documentdate", "pubdate", "published", "date"):
            value = article.get(key)
            if not isinstance(value, str):
                continue

            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception:
                pass

            if value.isdigit():
                if len(value) == 14:
                    try:
                        return datetime.strptime(value, "%Y%m%d%H%M%S")
                    except Exception:
                        pass
                elif len(value) == 8:
                    try:
                        return datetime.strptime(value, "%Y%m%d")
                    except Exception:
                        pass

        return None
